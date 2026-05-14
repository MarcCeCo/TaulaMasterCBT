# -*- coding: utf-8 -*-
"""
CREAR FAMÍLIES CBT - MODE TEST
================================
Llegeix el fitxer JSON exportat des de la plataforma TaulaMaster CBT-BIM
i crea 1 família per cada categoria present al JSON (per validar el procés).

Nom dels fitxers generats: CBT_<NOM_EQUIP>.rfa

Grups de paràmetres:
  - Paràmetres sense codi → grup "General"
  - Paràmetres amb codi   → grup "Data"
  - CBT_TAULA             → grup "General", valor = codi de taula de l'equip

Col·loca aquest fitxer a:
  %APPDATA%\pyRevit-Master\Extensions\CBT.extension\CBT.tab\CBT Tools.panel\Crear Families TEST.pushbutton\script.py

Prerequisits:
  - Descarrega el JSON des de la plataforma i guarda'l com: CBT_Revit_Config.json
    (a Documents\, Escriptori o Descàrregues — el script el trobarà automàticament)
  - El fitxer CBT_PARAMETRES-COMPARTITS.txt ha d'estar a Documents\
"""

import os
import glob
import json
import io
import clr
clr.AddReference('RevitAPI')
from Autodesk.Revit.DB import Transaction, SaveAsOptions
from pyrevit import forms, script

# ── CONFIGURACIÓ ──────────────────────────────────────────────
JSON_FILENAME      = "CBT_Revit_Config.json"
SHARED_PARAMS_FILE = "CBT_PARAMETRES-COMPARTITS.txt"
OUTPUT_FOLDER_NAME = "Families_TEST"
# ──────────────────────────────────────────────────────────────


def find_json_config():
    """
    Cerca el JSON de configuració en múltiples ubicacions habituals,
    independentment de l'usuari del PC.
    """
    home = os.path.expanduser("~")
    userprofile = os.environ.get("USERPROFILE", home)

    search_paths = [
        os.path.join(userprofile, "Documents", JSON_FILENAME),
        os.path.join(userprofile, "Documentos", JSON_FILENAME),
        os.path.join(userprofile, "My Documents", JSON_FILENAME),
        os.path.join(userprofile, "Desktop", JSON_FILENAME),
        os.path.join(userprofile, "Escritorio", JSON_FILENAME),
        os.path.join(userprofile, "Escriptori", JSON_FILENAME),
        os.path.join(userprofile, "Downloads", JSON_FILENAME),
        os.path.join(userprofile, "Descargas", JSON_FILENAME),
        os.path.join(userprofile, "Descàrregues", JSON_FILENAME),
        os.path.join(userprofile, JSON_FILENAME),
        os.path.join(home, JSON_FILENAME),
        os.path.join(userprofile, "OneDrive", "Documents", JSON_FILENAME),
        os.path.join(userprofile, "OneDrive", "Documentos", JSON_FILENAME),
        os.path.join(userprofile, "OneDrive", JSON_FILENAME),
    ]

    for path in search_paths:
        if os.path.isfile(path):
            return path

    # Cerca recursiva com a últim recurs
    for base_dir in ["Documents", "Documentos", "OneDrive"]:
        pattern = os.path.join(userprofile, base_dir, "**", JSON_FILENAME)
        matches = glob.glob(pattern, recursive=True)
        if matches:
            return max(matches, key=os.path.getmtime)

    return None


def find_shared_params():
    """
    Cerca el fitxer de paràmetres compartits en múltiples ubicacions.
    """
    home = os.path.expanduser("~")
    userprofile = os.environ.get("USERPROFILE", home)

    search_paths = [
        os.path.join(userprofile, "Documents", SHARED_PARAMS_FILE),
        os.path.join(userprofile, "Documentos", SHARED_PARAMS_FILE),
        os.path.join(userprofile, "Desktop", SHARED_PARAMS_FILE),
        os.path.join(userprofile, "Escritorio", SHARED_PARAMS_FILE),
        os.path.join(userprofile, "Escriptori", SHARED_PARAMS_FILE),
        os.path.join(userprofile, SHARED_PARAMS_FILE),
        os.path.join(home, SHARED_PARAMS_FILE),
        os.path.join(userprofile, "OneDrive", "Documents", SHARED_PARAMS_FILE),
    ]

    for path in search_paths:
        if os.path.isfile(path):
            return path

    for base_dir in ["Documents", "Documentos", "OneDrive"]:
        pattern = os.path.join(userprofile, base_dir, "**", SHARED_PARAMS_FILE)
        matches = glob.glob(pattern, recursive=True)
        if matches:
            return max(matches, key=os.path.getmtime)

    return None


def find_revit_templates():
    """
    Detecta la carpeta de plantilles de Revit per a qualsevol versió (2020–2030).
    """
    program_data = os.environ.get("PROGRAMDATA", r"C:\ProgramData")

    for year in range(2030, 2019, -1):
        for lang in ["English", "Spanish", "Metric Library"]:
            path = os.path.join(program_data, "Autodesk", "RVT {}".format(year),
                                "Family Templates", lang)
            if os.path.isdir(path):
                return path

    matches = glob.glob(
        os.path.join(program_data, "Autodesk", "RVT *", "Family Templates", "*")
    )
    return matches[0] if matches else None


def resolve_template(template_filename, templates_folder):
    """Cerca la plantilla en English i en carpetes alternatives com a fallback."""
    path = os.path.join(templates_folder, template_filename)
    if os.path.exists(path):
        return path
    parent = os.path.dirname(templates_folder)
    for alt_lang in ["Spanish", "Metric Library", "English"]:
        alt = os.path.join(parent, alt_lang, template_filename)
        if os.path.exists(alt):
            return alt
    return None


def run(equips, templates_folder, output_folder, shared_params_path, app, output):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    # Configura fitxer de paràmetres compartits
    app.SharedParametersFilename = shared_params_path
    shared_file = app.OpenSharedParameterFile()
    if shared_file is None:
        forms.alert(
            "No s'ha pogut obrir el fitxer de paràmetres compartits.\nRuta: " + shared_params_path,
            exitscript=True
        )

    # Índex de paràmetres: nom -> definició
    param_index = {}
    for grp in shared_file.Groups:
        for defn in grp.Definitions:
            param_index[defn.Name] = defn

    created = 0
    errors  = []

    for i, equip in enumerate(equips):
        nom        = equip["nom"]
        cat        = equip["cat"]
        params     = equip["params"]
        template   = equip["template"]
        table_code = equip.get("table_code", "")
        equip_code = equip.get("equip_code", "")

        output.print_md("**[{}/{}]** {} — *{}*".format(i + 1, len(equips), nom, cat))

        template_path = resolve_template(template, templates_folder)
        if template_path is None:
            msg = "Plantilla no trobada: " + template
            errors.append(nom + ": " + msg)
            output.print_md("  ⚠️ " + msg)
            continue

        # Nom del fitxer: CBT_NOM-EQUIP_CODI-EQUIP.rfa (majúscules, espais substituïts per -)
        nom_safe = nom.upper().replace(" ", "-")
        if equip_code:
            file_stem = "CBT_{}_{}".format(nom_safe, equip_code.upper())
        else:
            file_stem = "CBT_{}".format(nom_safe)
        out_path = os.path.join(output_folder, file_stem + ".rfa")
        if os.path.exists(out_path):
            output.print_md("  ⏭ Ja existeix, saltant.")
            continue

        try:
            fam_doc = app.NewFamilyDocument(template_path)
        except Exception as e:
            msg = "Error obrint plantilla: " + str(e)
            errors.append(nom + ": " + msg)
            output.print_md("  ❌ " + msg)
            continue

        fam_mgr = fam_doc.FamilyManager
        t = Transaction(fam_doc, "Afegir params CBT")
        t.Start()
        try:
            for param_entry in params:
                # Suport tant del format nou (dict) com de l'antic (string)
                if isinstance(param_entry, dict):
                    pname = param_entry.get("name", "")
                    has_codi = bool(param_entry.get("codi"))
                else:
                    pname = param_entry
                    has_codi = False

                if not pname or pname not in param_index:
                    if pname:
                        output.print_md("  ⚠️ Paràmetre no trobat al fitxer compartit: " + pname)
                    continue

                # Grup: Data si té codi, General si no en té
                if has_codi:
                    grp = _PARAM_GROUP_DATA
                else:
                    grp = _PARAM_GROUP_GENERAL

                try:
                    fam_mgr.AddParameter(param_index[pname], grp, True)
                except Exception:
                    pass

            # Paràmetre CBT_TAULA: afegir i omplir amb el codi de taula
            if "CBT_TAULA" in param_index:
                try:
                    fp = fam_mgr.AddParameter(param_index["CBT_TAULA"], _PARAM_GROUP_GENERAL, True)
                    if table_code and fp is not None:
                        fam_mgr.Set(fp, table_code)
                except Exception:
                    pass

            t.Commit()
        except Exception as e:
            t.RollBack()
            msg = "Error afegint paràmetres: " + str(e)
            errors.append(nom + ": " + msg)
            output.print_md("  ❌ " + msg)
            fam_doc.Close(False)
            continue

        opts = SaveAsOptions()
        opts.OverwriteExistingFile = True
        try:
            fam_doc.SaveAs(out_path, opts)
            fam_doc.Close(False)
            created += 1
            output.print_md("  ✅ Guardada")
        except Exception as e:
            msg = "Error guardant: " + str(e)
            errors.append(nom + ": " + msg)
            output.print_md("  ❌ " + msg)
            fam_doc.Close(False)

    output.print_md("---")
    output.print_md("## Resultat: {}/{} famílies creades".format(created, len(equips)))
    if errors:
        output.print_md("**Errors:**")
        for e in errors:
            output.print_md("- " + e)
    else:
        output.print_md("**Sense errors ✅**")
    output.print_md("**Carpeta de sortida:** `{}`".format(output_folder))


# ── PUNT D'ENTRADA ────────────────────────────────────────────
output = script.get_output()

try:
    app = __revit__.Application
except NameError:
    forms.alert("Aquest script s'ha d'executar des de pyRevit (dins Revit).", exitscript=True)

# ── Compatibilitat API Revit 2026+ ─────────────────────────────
# BuiltInParameterGroup va desaparèixer a Revit 2026.
# Detectem la versió en temps d'execució per evitar ImportError a IronPython.
_revit_version = int(app.VersionNumber)
if _revit_version >= 2026:
    from Autodesk.Revit.DB import GroupTypeId
    _PARAM_GROUP_GENERAL = GroupTypeId.General
    _PARAM_GROUP_DATA    = GroupTypeId.Data
else:
    from Autodesk.Revit.DB import BuiltInParameterGroup
    _PARAM_GROUP_GENERAL = BuiltInParameterGroup.PG_GENERAL
    _PARAM_GROUP_DATA    = BuiltInParameterGroup.PG_DATA
# ──────────────────────────────────────────────────────────────

# ── Cerca automàtica ──
output.print_md("## [TEST] Cercant fitxers de configuració CBT...")

json_path = find_json_config()
if json_path is None:
    forms.alert(
        "No s'ha trobat el fitxer de configuració: {}\n\n"
        "On obtenir-lo:\n"
        "  Accedeix a la plataforma TaulaMaster CBT-BIM, ves a\n"
        "  l'apartat d'exportació Revit i descarrega el fitxer JSON.\n"
        "  Ha de tenir exactament aquest nom: {}\n\n"
        "On guardar-lo (qualsevol d'aquestes ubicacions):\n"
        "  - C:\\Users\\<usuari>\\Documents\\\n"
        "  - C:\\Users\\<usuari>\\Desktop\\\n"
        "  - C:\\Users\\<usuari>\\Downloads\\\n"
        "  - C:\\Users\\<usuari>\\OneDrive\\Documents\\\n\n"
        "No canviis el nom del fitxer.".format(JSON_FILENAME, JSON_FILENAME),
        exitscript=True
    )

output.print_md("  ✅ JSON: `{}`".format(json_path))

shared_params_path = find_shared_params()
if shared_params_path is None:
    forms.alert(
        "No s'ha trobat el fitxer de paràmetres compartits: {}\n\n"
        "On obtenir-lo:\n"
        "  El fitxer el proporciona l'equip CBT. Si no el tens,\n"
        "  contacta amb el teu administrador BIM o descarrega'l\n"
        "  des de la plataforma TaulaMaster CBT-BIM.\n\n"
        "On guardar-lo:\n"
        "  Ha d'estar a: C:\\Users\\<usuari>\\Documents\\\n"
        "  amb el nom exacte: {}\n\n"
        "No canviis el nom del fitxer.".format(SHARED_PARAMS_FILE, SHARED_PARAMS_FILE),
        exitscript=True
    )

output.print_md("  ✅ Paràmetres compartits: `{}`".format(shared_params_path))

# ── Llegeix JSON ──
with io.open(json_path, "r", encoding="utf-8") as f:
    config = json.load(f)

all_equips = config["equipments"]

# ── Plantilles Revit ──
templates_folder = config.get("templates_folder", None)
if templates_folder and not os.path.isdir(os.path.expandvars(templates_folder)):
    templates_folder = None

if not templates_folder:
    templates_folder = find_revit_templates()
    if templates_folder:
        output.print_md("  ✅ Plantilles autodetectades: `{}`".format(templates_folder))
    else:
        forms.alert("No s'ha trobat cap instal·lació de Revit amb plantilles.", exitscript=True)
else:
    templates_folder = os.path.expandvars(templates_folder)

# ── Carpeta de sortida TEST ──
userprofile = os.environ.get("USERPROFILE", os.path.expanduser("~"))
docs = (os.path.join(userprofile, "Documents")
        if os.path.isdir(os.path.join(userprofile, "Documents"))
        else os.path.join(userprofile, "Documentos"))
output_folder = os.path.join(docs, OUTPUT_FOLDER_NAME)

# ── MODE TEST: 1 família per categoria ──
seen_cats = {}
for eq in all_equips:
    cat = eq["cat"]
    if cat not in seen_cats:
        seen_cats[cat] = eq

test_equips = list(seen_cats.values())

# ── Confirmació ──
cat_lines = "\n".join(
    "• {} → {}".format(eq["cat"], eq["nom"]) for eq in test_equips
)
res = forms.alert(
    "MODE TEST — Es crearan {} famílies (1 per categoria):\n\n{}\n\n"
    "─── FITXERS DETECTATS ───────────────────────────\n"
    "JSON de configuració:\n  {}\n\n"
    "Paràmetres compartits:\n  {}\n\n"
    "Plantilles Revit:\n  {}\n\n"
    "─── CARPETA DE SORTIDA ──────────────────────────\n"
    "  {}\n\n"
    "─── QUÈ PASSARÀ ─────────────────────────────────\n"
    "  Es crearan {} arxius .rfa amb el format:\n"
    "  CBT_<nom-equip>_<codi>.rfa\n"
    "  Les famílies ja existents es saltaran.\n\n"
    "Continuar?".format(
        len(test_equips), cat_lines,
        json_path, shared_params_path, templates_folder,
        output_folder, len(test_equips)
    ),
    ok=True, cancel=True
)
if not res:
    script.exit()

output.print_md("## [TEST] Creant {} famílies CBT".format(len(test_equips)))
run(test_equips, templates_folder, output_folder, shared_params_path, app, output)
