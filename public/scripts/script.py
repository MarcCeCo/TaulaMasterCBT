# -*- coding: utf-8 -*-
"""
CREAR FITXERS MASTER CBT
========================
Per a cada instal·lació detectada, obre la plantilla CBT_PLANTILLA.rte,
vincula els fitxers _ENT + _EST + _MEP (incloent ZonaA, ZonaB, etc.),
publica la vista 3D "TAULA-MASTER" i desa el resultat com a:

    codiInstalacio_nomInstalacio_MASTER.rvt
    Ex: ED008_CALDES-DE-MONTBUI_MASTER.rvt

CANVIS RESPECTE LA VERSIÓ ANTERIOR:
  - rvt_est i rvt_mep ara són LLISTES (suporta ZonaA, ZonaB, etc.)
  - vincula_rvt() força la càrrega del vincle (Load) → necessari per ACC/Model Derivative
  - Els vincles es desen amb ruta RELATIVA al MASTER (compatible amb ACC)
  - [NOU] vincula_rvt() retorna el motiu exacte de l'error en lloc de silenciar-lo
  - [NOU] Comprovació pre-vol: verifica existència i permisos de cada RVT ABANS d'obrir la plantilla
  - [NOU] El log mostra la ruta absoluta completa de cada fitxer que falla
  - [NOU] Distinció entre: fitxer no trobat / sense permisos / error API Revit / versió incompatible

Col·loca aquest fitxer a:
  %APPDATA%\pyRevit-Master\Extensions\CBT.extension\CBT.tab\CBT Tools.panel\Crear Masters.pushbutton\script.py

Prerequisits:
  - La plantilla CBT_PLANTILLA.rte ha d'estar a Documents\ o al costat dels RVTs
  - Els fitxers _ENT, _EST i _MEP han d'estar accessibles (ruta local o Forma sincronitzat)
  - Si s'interromp, pots tornar a executar-lo: els MASTERs ja existents es saltaran
  - Quan pugis el MASTER a ACC, puja TAMBÉ tots els RVTs de disciplina a la MATEIXA carpeta
"""

import os
import glob
import re
import clr

clr.AddReference('RevitAPI')
clr.AddReference('RevitAPIUI')

from Autodesk.Revit.DB import (
    Transaction,
    SubTransaction,
    SaveAsOptions,
    RevitLinkOptions,
    ModelPathUtils,
    RevitLinkType,
    RevitLinkInstance,
    ExternalFileReference,
    LinkedFileStatus,
    View3D,
    ViewFamilyType,
    ViewFamily,
    FilteredElementCollector,
    ElementId,
    PathType,
    Transform,
    # Per netejar la plantilla
    CurveElement,
    TextNote,
    Dimension,
    FamilyInstance,
    ImportInstance,
    Group,
    FilledRegion,
    SketchPlane,
    # Per desactivar categories d'anotació
    BuiltInCategory,
    CategoryType,
    ImportPlacement,
)
try:
    from Autodesk.Revit.DB.Plumbing import Pipe
    _PIPE_CLASS = Pipe
except Exception:
    _PIPE_CLASS = None

from pyrevit import forms, script

# ── CONFIGURACIÓ ──────────────────────────────────────────────────────────────
PLANTILLA_NOM   = "CBT_PLANTILLA.rte"
VISTA_NOM       = "TAULA-MASTER"       # Nom exacte de la vista 3D publicada
SUFIX_MASTER    = "_MASTER"
SUFIX_ENT       = "_ENT"
SUFIX_EST       = "_EST"
SUFIX_MEP       = "_MEP"
# ─────────────────────────────────────────────────────────────────────────────


# ── Helpers de cerca ──────────────────────────────────────────────────────────

def cerca_fitxer(nom, ubicacions_extra=None):
    """
    Cerca un fitxer per nom en les ubicacions habituals de l'usuari.
    Retorna el primer trobat o None.
    """
    home        = os.path.expanduser("~")
    userprofile = os.environ.get("USERPROFILE", home)

    # Obté la ruta real de l'Escriptori (pot estar redirigit a OneDrive)
    desktop_real = None
    try:
        import ctypes
        buf = ctypes.create_unicode_buffer(260)
        # CSIDL_DESKTOPDIRECTORY = 0x0010
        ctypes.windll.shell32.SHGetFolderPathW(0, 0x0010, 0, 0, buf)
        if buf.value and os.path.isdir(buf.value):
            desktop_real = buf.value
    except Exception:
        pass

    bases = []
    # L'Escriptori primer — és on sol estar la plantilla
    if desktop_real:
        bases.append(desktop_real)
    bases += [
        os.path.join(userprofile, "Desktop"),
        os.path.join(userprofile, "Escritorio"),
        os.path.join(userprofile, "Escriptori"),
        os.path.join(userprofile, "Documents"),
        os.path.join(userprofile, "Documentos"),
        os.path.join(userprofile, "Downloads"),
        os.path.join(userprofile, "Descargas"),
        os.path.join(userprofile, "Descàrregues"),
        userprofile,
        home,
        os.path.join(userprofile, "OneDrive", "Desktop"),
        os.path.join(userprofile, "OneDrive", "Escritorio"),
        os.path.join(userprofile, "OneDrive", "Documents"),
        os.path.join(userprofile, "OneDrive", "Documentos"),
        os.path.join(userprofile, "OneDrive"),
    ]

    if ubicacions_extra:
        bases = list(ubicacions_extra) + bases

    for base in bases:
        ruta = os.path.join(base, nom)
        if os.path.isfile(ruta):
            return ruta

    # Cerca recursiva en Documents / OneDrive
    for base in [os.path.join(userprofile, "Documents"),
                 os.path.join(userprofile, "Documentos"),
                 os.path.join(userprofile, "OneDrive")]:
        if not os.path.isdir(base):
            continue
        coincidencies = glob.glob(os.path.join(base, "**", nom), recursive=True)
        if coincidencies:
            return max(coincidencies, key=os.path.getmtime)

    return None


def cerca_rvts_en_carpeta(carpeta):
    """
    Retorna tots els .rvt de la carpeta (no recursiu).
    """
    if not os.path.isdir(carpeta):
        return []
    return [
        os.path.join(carpeta, f)
        for f in os.listdir(carpeta)
        if f.lower().endswith(".rvt")
    ]


def conté_paraula(nom_fitxer, keyword):
    """
    Comprova si el nom de fitxer conté _KEYWORD seguit de: res, _, . o dígit.
    Exemples que passen:
      ED004_MONTORNES_FM_ENT_24.rvt       → ENT ✅
      ED004_MONTORNES_FM_EST_24.ZonaA.rvt → EST ✅
      ED004_MONTORNES_FM_MEP_24.ZonaB.rvt → MEP ✅
    Exemples que NO passen:
      ED008_ENTORN.rvt → ENT ❌ (evita falsos positius)
    """
    upper = nom_fitxer.upper()
    idx   = upper.find("_" + keyword)
    if idx == -1:
        return False
    pos_after = idx + len(keyword) + 1
    char_after = upper[pos_after:pos_after + 1]
    return char_after in ("", "_", ".") or (char_after.isdigit())


def nom_master(codi_installacio, nom_installacio):
    """
    Genera el nom del fitxer MASTER.
    Ex: ED008 + CALDES DE MONTBUI → ED008_CALDES-DE-MONTBUI_MASTER.rvt
    """
    nom_net = nom_installacio.upper().replace(" ", "-")
    nom_net = re.sub(r'[\\/:*?"<>|]', "", nom_net)
    return "{}_{}{}".format(codi_installacio.upper(), nom_net, SUFIX_MASTER)


# ── Lògica de detecció d'instal·lacions ──────────────────────────────────────

def detecta_installacions(carpeta_arrel):
    """
    Navega la carpeta arrel buscant el patró:
      <carpeta_sistema>/
        <codiInstallacio>_<nomInstallacio>/
          [fitxers .rvt amb _ENT, _EST, _MEP]

    CANVI: rvt_est i rvt_mep ara són llistes per suportar ZonaA, ZonaB, etc.

    Retorna llista de dicts amb:
      codi, nom, rvt_ent (llista), rvt_est (llista), rvt_mep (llista),
      carpeta, master_existent
    """
    installacions = []

    if not os.path.isdir(carpeta_arrel):
        return installacions

    for sistema_dir in sorted(os.listdir(carpeta_arrel)):
        sistema_path = os.path.join(carpeta_arrel, sistema_dir)
        if not os.path.isdir(sistema_path):
            continue

        for inst_dir in sorted(os.listdir(sistema_path)):
            inst_path = os.path.join(sistema_path, inst_dir)
            if not os.path.isdir(inst_path):
                continue

            # Parseja el nom de la carpeta: codi_nom (ex: ED004_EDAR-MONTORNES-DEL-VALLES)
            m = re.match(r'^([A-Z]+\d+)_(.+)$', inst_dir, re.IGNORECASE)
            if not m:
                continue

            codi = m.group(1).upper()
            nom  = m.group(2).replace("-", " ").strip()

            # Cerca subcarpeta 001_MODEL-BIM (o directament a inst_path com a fallback)
            carpeta_bim = os.path.join(inst_path, "001_MODEL-BIM")
            if not os.path.isdir(carpeta_bim):
                carpeta_bim = inst_path

            rvts = cerca_rvts_en_carpeta(carpeta_bim)
            if not rvts:
                continue

            # ── CANVI CLAU: llistes en lloc de next() ──────────────────────
            rvt_ent    = [r for r in rvts if conté_paraula(os.path.basename(r), "ENT")]
            rvt_est    = [r for r in rvts if conté_paraula(os.path.basename(r), "EST")]
            rvt_mep    = [r for r in rvts if conté_paraula(os.path.basename(r), "MEP")]
            master_ex  = next((r for r in rvts if conté_paraula(os.path.basename(r), "MASTER")), None)
            # ───────────────────────────────────────────────────────────────

            # Exclou el propi MASTER de les llistes de disciplina
            if master_ex:
                rvt_ent = [r for r in rvt_ent if r != master_ex]
                rvt_est = [r for r in rvt_est if r != master_ex]
                rvt_mep = [r for r in rvt_mep if r != master_ex]

            # Necessitem almenys un fitxer de disciplina
            if not any([rvt_ent, rvt_est, rvt_mep]):
                continue

            installacions.append({
                "codi":             codi,
                "nom":              nom,
                "carpeta":          carpeta_bim,
                "rvt_ent":          rvt_ent,   # llista (pot tenir 0, 1 o més)
                "rvt_est":          rvt_est,   # llista (pot tenir ZonaA, ZonaB...)
                "rvt_mep":          rvt_mep,   # llista (pot tenir ZonaA, ZonaB...)
                "master_existent":  master_ex,
            })

    return installacions


# ── Creació del fitxer MASTER ─────────────────────────────────────────────────

def crea_vista_taula_master(doc):
    """
    Crea (o recupera si ja existeix) la vista 3D anomenada TAULA-MASTER.
    """
    vistes = FilteredElementCollector(doc).OfClass(View3D).ToElements()
    for v in vistes:
        if v.Name == VISTA_NOM and not v.IsTemplate:
            return v

    tipus = FilteredElementCollector(doc).OfClass(ViewFamilyType).ToElements()
    tipus_3d = next(
        (t for t in tipus if t.ViewFamily == ViewFamily.ThreeDimensional),
        None
    )
    if tipus_3d is None:
        return None

    vista = View3D.CreateIsometric(doc, tipus_3d.Id)
    vista.Name = VISTA_NOM
    return vista


def neteja_plantilla(doc, output):
    """
    1. Elimina geometria de la plantilla: línies, textos, cotes, famílies,
       tuberies, importacions, regions omplertes i grups.
    2. Desactiva totes les categories d'anotació a totes les vistes.
    """
    # ── PART 1: Eliminar elements ─────────────────────────────────────────────
    classes_a_eliminar = [
        CurveElement,    # Línies de model, detall, referència
        TextNote,        # Textos
        Dimension,       # Cotes
        FamilyInstance,  # Famílies instanciades (mobiliari, equips, etc.)
        ImportInstance,  # Importacions DWG/DXF
        FilledRegion,    # Regions omplertes
        Group,           # Grups
    ]

    ids_a_eliminar = []
    for cls in classes_a_eliminar:
        try:
            ids_a_eliminar.extend(list(
                FilteredElementCollector(doc).OfClass(cls).ToElementIds()
            ))
        except Exception:
            pass

    # Tuberies (classe al namespace Plumbing, importada condicionalment)
    if _PIPE_CLASS is not None:
        try:
            ids_a_eliminar.extend(list(
                FilteredElementCollector(doc).OfClass(_PIPE_CLASS).ToElementIds()
            ))
        except Exception:
            pass

    eliminats = 0
    errors_elim = 0
    if ids_a_eliminar:
        try:
            with Transaction(doc, "Netejar plantilla") as t:
                t.Start()
                for eid in ids_a_eliminar:
                    try:
                        doc.Delete(eid)
                        eliminats += 1
                    except Exception:
                        errors_elim += 1
                t.Commit()
        except Exception as e:
            output.print_md("    ⚠️ Error netejant geometria: {}".format(str(e)))
    else:
        output.print_md("    ℹ️ La plantilla no conté geometria a eliminar.")

    # ── PART 2: Desactivar categories d'anotació a totes les vistes ──────────
    # Recorrem totes les vistes del document i per a cada categoria d'anotació
    # (CategoryType.Annotation) que sigui visible, la amaguem.
    categories_amagades = 0
    try:
        vistes = FilteredElementCollector(doc).OfClass(
            __import__('Autodesk.Revit.DB', fromlist=['View']).View
        ).ToElements()
    except Exception:
        try:
            from Autodesk.Revit.DB import View
            vistes = FilteredElementCollector(doc).OfClass(View).ToElements()
        except Exception:
            vistes = []

    # Categories a amagar: totes les d'anotació + Nivells (categoria de model)
    cats_a_amagar = []
    try:
        for cat in doc.Settings.Categories:
            try:
                if cat.CategoryType == CategoryType.Annotation:
                    cats_a_amagar.append(cat)
            except Exception:
                pass
    except Exception:
        pass
    # Nivells/Levels és de tipus Model, cal afegir-la explícitament
    try:
        cat_nivells = doc.Settings.Categories.get_Item(BuiltInCategory.OST_Levels)
        if cat_nivells is not None:
            cats_a_amagar.append(cat_nivells)
    except Exception:
        pass

    if cats_a_amagar and vistes:
        try:
            with Transaction(doc, "Amagar categories anotacio i nivells") as t_ann:
                t_ann.Start()
                for vista in vistes:
                    try:
                        if vista.IsTemplate:
                            continue
                        for cat in cats_a_amagar:
                            try:
                                vista.SetCategoryHidden(cat.Id, True)
                                categories_amagades += 1
                            except Exception:
                                pass
                    except Exception:
                        pass
                t_ann.Commit()
        except Exception as e:
            output.print_md("    ⚠️ Error amagant categories: {}".format(str(e)))

    output.print_md(
        "    🧹 Neteja: {} elements eliminats ({} ignorats) | "
        "{} categories d'anotació desactivades.".format(
            eliminats, errors_elim, categories_amagades
        )
    )


def vincula_rvt(doc, ruta_rvt, app, output):
    """
    Vincula un fitxer RVT al document i el carrega.

    ── Causa del problema "descarregat en tornar a obrir" ──────────────────────
    RevitLinkType.Create() a Revit 2026 crea el vincle internament en estat
    LocallyUnloaded. Load()/LoadFrom() el carrega EN MEMÒRIA però SaveAs()
    no persisteix aquest estat: en tornar a obrir el MASTER, Revit llegeix
    l'estat guardat (LocallyUnloaded) i mostra el vincle com a descarregat.

    Solució: usar RevitLinkOptions(True) al Create() — el segon paràmetre
    indica "locallySpecified=True" que força l'estat inicial a Loaded.
    Si això no funciona, el fallback és modificar directament la propietat
    InitialLinkStatus del RevitLinkType després de Create().
    ────────────────────────────────────────────────────────────────────────────
    """
    if not os.path.isfile(ruta_rvt):
        return False, "Fitxer no trobat: {}".format(ruta_rvt)
    try:
        with open(ruta_rvt, "rb"):
            pass
    except IOError as e:
        return False, "Fitxer no accessible: {}".format(str(e))

    nom_fitxer     = os.path.basename(ruta_rvt)
    model_path_abs = ModelPathUtils.ConvertUserVisiblePathToModelPath(ruta_rvt)

    # ── PAS 1: Create() ───────────────────────────────────────────────────────
    # RevitLinkOptions(False) = isFromRevitServer=False (fitxer local/USB)
    result = None
    try:
        with Transaction(doc, "Crear vincle: {}".format(nom_fitxer)) as t:
            t.Start()
            result = RevitLinkType.Create(doc, model_path_abs, RevitLinkOptions(False))
            if result is None:
                t.RollBack()
                return False, "Create() ha retornat None"
            t.Commit()
    except Exception as e:
        return False, "Create() error: {}".format(str(e))

    link_type = doc.GetElement(result.ElementId)
    if link_type is None:
        return False, "No s'ha pogut obtenir RevitLinkType"

    # ── PAS 2: LoadFrom() amb ruta absoluta ───────────────────────────────────
    # Intentem carregar. Si falla, registrem el motiu exacte al log.
    load_ok = False
    load_msg = ""
    try:
        lr = link_type.LoadFrom(model_path_abs)
        load_ok = True
        output.print_md("      🔧 LoadFrom() executat")
    except Exception as e:
        load_msg = str(e)
        try:
            link_type.Load()
            load_ok = True
            output.print_md("      🔧 Load() executat (fallback)")
        except Exception as e2:
            load_msg += " | Load(): " + str(e2)

    # ── PAS 3: Verificació de l'estat real ───────────────────────────────────
    status_str = "?"
    try:
        ref = link_type.GetExternalFileReference()
        if ref is not None:
            status_str = str(ref.GetLinkedFileStatus())
    except Exception as ex:
        status_str = "error: {}".format(str(ex))

    output.print_md("      📊 LinkedFileStatus après load: **{}**".format(status_str))

    if status_str != "Loaded":
        return False, (
            "Vincle creat però estat={}. load_ok={}. {}".format(
                status_str, load_ok, load_msg
            )
        )

    # ── PAS 4: Crear instància a l'origen (Internal Origin) ──────────────────
    # RevitLinkType.Create() crea el tipus però NO insereix cap exemplar al model.
    # Sense RevitLinkInstance, Revit mostra el link com ✕ en obrir el MASTER.
    # Transform.Identity col·loca l'exemplar a (0,0,0) respectant l'Internal Origin.
    try:
        with Transaction(doc, "Crear exemplar: {}".format(nom_fitxer)) as t_inst:
            t_inst.Start()
            # Revit 2025+ requires ImportPlacement instead of Transform.
            # ImportPlacement.Origin = Internal Origin (equivalent to Transform.Identity).
            try:
                RevitLinkInstance.Create(doc, link_type.Id, ImportPlacement.Origin)
            except Exception:
                RevitLinkInstance.Create(doc, link_type.Id, Transform.Identity)
            t_inst.Commit()
        output.print_md("      📌 Instància creada a l'origen (Internal Origin)")
    except Exception as e_inst:
        output.print_md("      ⚠️ No s'ha pogut crear la instància: {}".format(str(e_inst)))
        # No és fatal — el vincle existeix, simplement no serà visible fins que
        # l'usuari el col·loqui manualment des del Navegador de projectes.

    return True, None



def crea_master(inst, plantilla_path, carpeta_sortida, app, output):
    """
    Crea el fitxer MASTER per a una instal·lació:
      1. Obre la plantilla .rte
      2. Vincula TOTS els fitxers de cada disciplina (ENT, EST x zones, MEP x zones)
      3. Crea la vista 3D TAULA-MASTER
      4. Desa com a codiInstallacio_nomInstallacio_MASTER.rvt

    Retorna (True, ruta_master) si tot va bé, (False, missatge_error) si no.
    """
    nom_fitxer   = nom_master(inst["codi"], inst["nom"]) + ".rvt"
    ruta_sortida = os.path.join(carpeta_sortida, nom_fitxer)

    if os.path.exists(ruta_sortida):
        output.print_md("  ♻️ Ja existeix, es sobreescriurà: `{}`".format(nom_fitxer))

    # ── DIAGNÒSTIC PRE-VOL: comprova accessibilitat de tots els fitxers ──────
    totes_les_disciplines_check = (
        [("ENT", r) for r in inst["rvt_ent"]] +
        [("EST", r) for r in inst["rvt_est"]] +
        [("MEP", r) for r in inst["rvt_mep"]]
    )
    errors_acces = []
    for disciplina, ruta in totes_les_disciplines_check:
        nom_arxiu = os.path.basename(ruta)
        if not os.path.isfile(ruta):
            errors_acces.append("    ❌ {} `{}` → NO EXISTEIX al disc: `{}`".format(
                disciplina, nom_arxiu, ruta))
        elif not os.access(ruta, os.R_OK):
            errors_acces.append("    ❌ {} `{}` → SENSE PERMISOS DE LECTURA: `{}`".format(
                disciplina, nom_arxiu, ruta))
        else:
            output.print_md("    🔍 {} `{}` → OK (accessible)".format(disciplina, nom_arxiu))

    if errors_acces:
        output.print_md("  ⚠️ **Problemes d'accés detectats ABANS de vincular:**")
        for e in errors_acces:
            output.print_md(e)
        if len(errors_acces) == len(totes_les_disciplines_check):
            return False, (
                "Cap fitxer de disciplina és accessible al disc. "
                "Comprova que la carpeta 001_MODEL-BIM conté els RVTs o que "
                "els fitxers estan sincronitzats localment (no només al núvol)."
            )
    # ─────────────────────────────────────────────────────────────────────────

    # 1. Obre la plantilla
    try:
        doc_master = app.OpenDocumentFile(plantilla_path)
    except Exception as e:
        return False, "Error obrint plantilla: {}".format(str(e))

    try:
        # 1b. Neteja la plantilla: elimina geometria, línies, textos, etc.
        output.print_md("  🧹 Netejant contingut de la plantilla...")
        neteja_plantilla(doc_master, output)

        # 2. Vincula TOTS els fitxers de disciplina.
        # IMPORTANT: vincula_rvt() gestiona les seves pròpies Transactions internament
        # (Create() dins d'una Transaction, Load() fora). NO emboliquem el bucle en
        # cap Transaction externa o es produiria l'error "sub-transaction not permitted".
        vincles_ok  = []
        vincles_err = []

        totes_les_disciplines = (
            [("ENT", r) for r in inst["rvt_ent"]] +
            [("EST", r) for r in inst["rvt_est"]] +
            [("MEP", r) for r in inst["rvt_mep"]]
        )

        for disciplina, ruta in totes_les_disciplines:
            nom_arxiu = os.path.basename(ruta)
            ok, motiu = vincula_rvt(doc_master, ruta, app, output)
            if ok:
                vincles_ok.append(nom_arxiu)
                output.print_md("    ✅ Vinculat {}: `{}`".format(disciplina, nom_arxiu))
            else:
                vincles_err.append(nom_arxiu)
                output.print_md("    ⚠️ No s'ha pogut vincular {}: `{}`".format(
                    disciplina, nom_arxiu))
                output.print_md("       📍 Ruta: `{}`".format(ruta))
                output.print_md("       ❓ Motiu: {}".format(motiu if motiu else "Desconegut"))

        if not vincles_ok:
            doc_master.Close(False)
            return False, "Cap fitxer de disciplina s'ha pogut vincular. Consulta els ⚠️ anteriors per al motiu exacte."

        # 3. Crea la vista 3D TAULA-MASTER i desactiva TOTES les categories
        #    d'anotació (+ categories de model problemàtiques) directament
        #    sobre aquesta vista, ja que es crea DESPRÉS de neteja_plantilla().
        with Transaction(doc_master, "Crear vista TAULA-MASTER") as t:
            t.Start()
            vista = crea_vista_taula_master(doc_master)
            if vista is None:
                output.print_md("    ⚠️ No s'ha pogut crear la vista {}, continuant...".format(VISTA_NOM))
                t.RollBack()
            else:
                cats_amagades = 0
                cats_error    = 0

                # ── Totes les categories d'anotació ──────────────────────────
                for cat in doc_master.Settings.Categories:
                    try:
                        if cat.CategoryType == CategoryType.Annotation:
                            try:
                                if vista.CanCategoryBeHidden(cat.Id):
                                    vista.SetCategoryHidden(cat.Id, True)
                                    cats_amagades += 1
                            except Exception:
                                cats_error += 1
                    except Exception:
                        pass

                # ── Categories de model problemàtiques (cada una en try separat) ─
                # Nota: els noms exactes de BuiltInCategory varien entre versions.
                # Usem strings per evitar AttributeError si no existeix la constant.
                bics_model = [
                    "OST_Levels",
                    "OST_Grids",
                    "OST_ReferencePlanes",
                    "OST_ReferenceLines",
                    "OST_ScopeBoxes",
                    "OST_CLines",           # Eixos
                    "OST_VolumeOfInterest", # Caixes d'abast
                ]
                for bic_name in bics_model:
                    try:
                        bic = getattr(BuiltInCategory, bic_name)
                        cat = doc_master.Settings.Categories.get_Item(bic)
                        if cat is not None and vista.CanCategoryBeHidden(cat.Id):
                            vista.SetCategoryHidden(cat.Id, True)
                            cats_amagades += 1
                    except Exception:
                        pass  # Constant no disponible en aquesta versió de Revit

                output.print_md("    👁️ Vista {}: {} categories desactivades ({} errors ignorats).".format(
                    VISTA_NOM, cats_amagades, cats_error))

                # ── Publica la vista al "Conjunto 1" via ViewSheetSet ────────
                # A Revit, "publicar una vista" per a ACC/Model Derivative
                # significa afegir-la a un ViewSheetSet (conjunt d'impressió)
                # guardat al document. La UI de Revit ho anomena "Conjunto 1".
                # L'API: PrintManager → ViewSheetSetting → ViewSheetSet.Views
                #
                # Funciona en fitxers locals (no workshared). Com que obrim la
                # plantilla .rte localment, és sempre el cas aquí.
                publicada = False
                try:
                    pm = doc_master.PrintManager
                    pm.PrintRange = __import__(
                        'Autodesk.Revit.DB', fromlist=['PrintRange']
                    ).PrintRange.Select

                    vss = pm.ViewSheetSetting
                    # Recollim les vistes ja incloses al conjunt actual
                    try:
                        vistes_actuals = set(vss.CurrentViewSheetSet.Views)
                    except Exception:
                        vistes_actuals = set()

                    vistes_actuals.add(vista)

                    from Autodesk.Revit.DB import ViewSet
                    nou_set = ViewSet()
                    for v in vistes_actuals:
                        nou_set.Insert(v)

                    vss.CurrentViewSheetSet.Views = nou_set

                    # Desa el conjunt amb el nom "Conjunto 1" (o crea'l si no existeix)
                    nom_conjunt = "Conjunto 1"
                    try:
                        vss.SaveAs(nom_conjunt)
                        publicada = True
                    except Exception:
                        # Ja existeix amb aquest nom → el sobreescrivim
                        try:
                            vss.Save()
                            publicada = True
                        except Exception:
                            pass

                except Exception as ep_vss:
                    output.print_md("    ⚠️ ViewSheetSet error: {}".format(str(ep_vss)))

                # Fallback: dump de tots els paràmetres de la vista per diagnòstic
                if not publicada:
                    output.print_md("    🔎 Paràmetres de la vista (per diagnòstic):")
                    try:
                        for p in vista.Parameters:
                            try:
                                output.print_md("       • `{}` = `{}`".format(
                                    p.Definition.Name,
                                    p.AsValueString() or p.AsString() or str(p.AsInteger())
                                ))
                            except Exception:
                                pass
                    except Exception:
                        pass
                    output.print_md("    ℹ️ Vista {} creada però no publicada automàticament.".format(VISTA_NOM))
                else:
                    output.print_md("    📡 Vista {} afegida al '{}'.".format(VISTA_NOM, nom_conjunt))

                t.Commit()



        # 4. Desa el MASTER amb ruta ABSOLUTA
        # ─────────────────────────────────────────────────────────────────────
        # Els vincles es desen amb PathType.Absolute (ruta completa F:\...).
        # Això garanteix que en tornar a obrir el MASTER, Revit trobi els RVTs
        # independentment d'on estigui el fitxer MASTER.
        #
        # Per ACC: quan puges el MASTER i els RVTs a la mateixa carpeta del hub,
        # ACC resol els vincles pel NOM DE FITXER, ignorant la ruta absoluta
        # local. No cal PathType.Relative per a ACC.
        # ─────────────────────────────────────────────────────────────────────
        opts = SaveAsOptions()
        opts.OverwriteExistingFile = True
        doc_master.SaveAs(ruta_sortida, opts)
        doc_master.Close(False)

        return True, ruta_sortida



    except Exception as e:
        try:
            doc_master.Close(False)
        except Exception:
            pass
        return False, "Error durant la creació: {}".format(str(e))


# ── PUNT D'ENTRADA ────────────────────────────────────────────────────────────

output = script.get_output()

try:
    app = __revit__.Application
except NameError:
    forms.alert("Aquest script s'ha d'executar des de pyRevit (dins Revit).", exitscript=True)

output.print_md("# Crear fitxers MASTER CBT")
output.print_md("---")

# ── 1. Cerca la plantilla .rte ────────────────────────────────────────────────
output.print_md("## Cercant plantilla `{}`...".format(PLANTILLA_NOM))
plantilla_path = cerca_fitxer(PLANTILLA_NOM)

if plantilla_path is None:
    forms.alert(
        "No s'ha trobat la plantilla: {}\n\n"
        "On guardar-la:\n"
        "  - C:\\Users\\<usuari>\\Documents\\\n"
        "  - Al costat dels fitxers RVT\n\n"
        "El fitxer el trobaràs a la plataforma TaulaMaster CBT-BIM\n"
        "o a la carpeta de plantilles del projecte.".format(PLANTILLA_NOM),
        exitscript=True
    )

output.print_md("  ✅ Plantilla trobada:")
output.print_md("     📄 Ruta: `{}`".format(plantilla_path))
try:
    import datetime
    mida   = os.path.getsize(plantilla_path)
    data   = datetime.datetime.fromtimestamp(os.path.getmtime(plantilla_path))
    output.print_md("     📦 Mida: {:.0f} KB | Modificat: {}".format(
        mida / 1024, data.strftime("%d/%m/%Y %H:%M")))
except Exception:
    pass

# ── 2. Selecciona la carpeta arrel on hi ha les instal·lacions ────────────────
output.print_md("## Selecciona la carpeta arrel del projecte")
output.print_md(
    "> ⚠️ **Estructura esperada:**\n"
    "> ```\n"
    "> carpeta_arrel/\n"
    ">   XXX_SISTEMA/\n"
    ">     ED004_EDAR-MONTORNES-DEL-VALLES/\n"
    ">       001_MODEL-BIM/\n"
    ">         ED004_..._FM_ENT_24.rvt\n"
    ">         ED004_..._FM_EST_24.ZonaA.rvt\n"
    ">         ED004_..._FM_EST_24.ZonaB.rvt\n"
    ">         ED004_..._FM_MEP_24.ZonaA.rvt\n"
    "> ```\n"
    "> Selecciona la carpeta **per sobre** de la carpeta de sistema."
)

carpeta_arrel = forms.pick_folder(
    title="Selecciona la carpeta arrel del projecte (on hi ha les carpetes de sistema)"
)
if not carpeta_arrel:
    script.exit()

output.print_md("  📂 Carpeta arrel: `{}`".format(carpeta_arrel))

# ── 3. Detecta instal·lacions ────────────────────────────────────────────────
output.print_md("## Detectant instal·lacions...")
installacions = detecta_installacions(carpeta_arrel)

if not installacions:
    forms.alert(
        "No s'ha trobat cap instal·lació vàlida a:\n{}\n\n"
        "Comprova que la carpeta té l'estructura:\n"
        "  <carpeta_arrel>/\n"
        "    XXX_SISTEMA/\n"
        "      ED001_NOM-INSTALLACIO/\n"
        "        001_MODEL-BIM/\n"
        "          ED001_..._ENT_24.rvt\n"
        "          ED001_..._EST_24.ZonaA.rvt\n"
        "          ED001_..._MEP_24.rvt".format(carpeta_arrel),
        exitscript=True
    )

# Separa les que ja tenen MASTER (per informació, ja no es salten)
sense_master = installacions  # Ara es processen TOTES, sobreescrivint si cal
amb_master   = [i for i in installacions if i["master_existent"]]

output.print_md("  📋 Total instal·lacions: **{}**".format(len(installacions)))
output.print_md("  ♻️ Ja tenen MASTER (es sobreescriuran): **{}**".format(len(amb_master)))
output.print_md("  🔧 Noves: **{}**".format(len(installacions) - len(amb_master)))

if not installacions:
    forms.alert("No s'ha trobat cap instal·lació vàlida a:\n{}".format(carpeta_arrel), exitscript=True)

# Mostra el detall amb tots els arxius per disciplina
output.print_md("\n**Instal·lacions a processar:**")
for i in sense_master:
    arxius = (
        [os.path.basename(r) for r in i["rvt_ent"]] +
        [os.path.basename(r) for r in i["rvt_est"]] +
        [os.path.basename(r) for r in i["rvt_mep"]]
    )
    total_arxius = len(arxius)
    prefix = "♻️" if i["master_existent"] else "🔧"
    output.print_md("  - {} **{}** — {} ({} arxiu{} a vincular)".format(
        prefix, i["codi"], i["nom"], total_arxius, "s" if total_arxius != 1 else ""
    ))
    for a in arxius:
        output.print_md("      • `{}`".format(a))

# ── 4. Tria la carpeta de sortida ─────────────────────────────────────────────
output.print_md("## Carpeta de sortida")
output.print_md(
    "Els MASTER es desaran a la mateixa carpeta `001_MODEL-BIM` de cada instal·lació.\n"
    "Pots triar una carpeta alternativa si prefereixes centralitzar-los primer.\n\n"
    "> ℹ️ **Nota ACC:** Quan pugis el MASTER a ACC, puja TAMBÉ tots els RVTs de\n"
    "> disciplina a la **mateixa carpeta del hub**. ACC resoldrà els vincles pel\n"
    "> nom de fitxer automàticament durant la traducció."
)

opcio = forms.alert(
    "On vols desar els fitxers MASTER?\n\n"
    "• Mateixa carpeta: cada MASTER es desa a la carpeta 001_MODEL-BIM de la seva instal·lació\n"
    "• Carpeta alternativa: tries tu on desar-los tots junts",
    options=["Mateixa carpeta (recomanat)", "Tria una carpeta alternativa", "Cancel·lar"]
)

if opcio == "Cancel·lar" or opcio is None:
    script.exit()

carpeta_sortida_unica = None
if opcio == "Tria una carpeta alternativa":
    carpeta_sortida_unica = forms.pick_folder(title="Selecciona la carpeta de sortida per als MASTERs")
    if not carpeta_sortida_unica:
        script.exit()
    if not os.path.exists(carpeta_sortida_unica):
        os.makedirs(carpeta_sortida_unica)
    output.print_md("  📂 Sortida alternativa: `{}`".format(carpeta_sortida_unica))

# ── 5. Confirmació final ──────────────────────────────────────────────────────
missatge_confirm = (
    "Es crearan/sobreescriuran {} fitxers MASTER:\n\n"
    "{}\n\n"
    "Plantilla: {}\n\n"
    "Cada MASTER tindrà:\n"
    "  • Tots els vincles ENT + EST + MEP (ZonaA, ZonaB... inclosos)\n"
    "  • Vincles CARREGATS (necessari per ACC/Model Derivative)\n"
    "  • Vista 3D publicada com a \"{}\"\n\n"
    "⚠️ Els fitxers MASTER ja existents seran SOBREESCRITS.\n\n"
    "Continuar?"
).format(
    len(sense_master),
    "\n".join("  • {}_{}{}".format(
        i["codi"],
        i["nom"].upper().replace(" ", "-"),
        SUFIX_MASTER
    ) for i in sense_master[:10]) +
    ("\n  ... i {} més".format(len(sense_master) - 10) if len(sense_master) > 10 else ""),
    plantilla_path,
    VISTA_NOM
)

if not forms.alert(missatge_confirm, ok=True, cancel=True):
    script.exit()

# ── 6. Processa cada instal·lació ─────────────────────────────────────────────
output.print_md("---")
output.print_md("## Creant fitxers MASTER...")

creats   = []
saltats  = []
errors   = []
total    = len(sense_master)

for idx, inst in enumerate(sense_master):
    output.print_md("\n**[{}/{}]** {} — {}".format(idx + 1, total, inst["codi"], inst["nom"]))

    sortida = carpeta_sortida_unica if carpeta_sortida_unica else inst["carpeta"]

    ok, resultat = crea_master(inst, plantilla_path, sortida, app, output)

    if ok:
        creats.append(inst["codi"])
        output.print_md("  ✅ Desat: `{}`".format(os.path.basename(str(resultat))))
    else:
        errors.append((inst["codi"], resultat))
        output.print_md("  ❌ Error: {}".format(resultat))

# ── 7. Resum final ────────────────────────────────────────────────────────────
output.print_md("---")
output.print_md("## Resum final")
output.print_md("- ✅ Creats/sobreescrits correctament: **{}**".format(len(creats)))
output.print_md("- ❌ Errors: **{}**".format(len(errors)))

if creats:
    output.print_md("\n**Creats:**")
    for c in creats:
        output.print_md("  - {}{}".format(c, SUFIX_MASTER))

if errors:
    output.print_md("\n**Errors:**")
    for codi, msg in errors:
        output.print_md("  - {}: {}".format(codi, msg))

if creats:
    output.print_md(
        "\n> **Proper pas:** Puja els fitxers MASTER i TOTS els RVTs de disciplina\n"
        "> a la **mateixa carpeta** de `001_MODEL-BIM` a Autodesk ACC/Forma.\n"
        "> Model Derivative resoldrà els vincles automàticament pel nom de fitxer."
    )
