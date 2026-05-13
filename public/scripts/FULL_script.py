# -*- coding: utf-8 -*-
"""
CREAR FAMÍLIES CBT - VERSIÓ COMPLETA
=====================================
Llegeix el fitxer JSON exportat des de la plataforma TaulaMaster CBT-BIM
i crea totes les famílies .rfa amb els paràmetres compartits corresponents.

Col·loca aquest fitxer a:
  %APPDATA%\pyRevit-Master\Extensions\CBT.extension\CBT.tab\CBT Tools.panel\Crear Families FULL.pushbutton\script.py

Prerequisits:
  - Descarrega el JSON des de la plataforma i guarda'l com: CBT_Revit_Config.json
    (a Documents\, Escriptori o Descàrregues — el script el trobarà automàticament)
  - El fitxer CBT_PARAMETRES-COMPARTITS.txt ha d'estar a Documents\

Si s'interromp, pots tornar a executar-lo:
  les famílies ja creades es saltaran automàticament.
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
JSON_FILENAME       = "CBT_Revit_Config.json"
SHARED_PARAMS_FILE  = "CBT_PARAMETRES-COMPARTITS.txt"
DEFAULT_OUTPUT_NAME = "Families_Output"
# ──────────────────────────────────────────────────────────────


def find_json_config():
    """
    Cerca el JSON de configuració en múltiples ubicacions habituals,
    independentment de l'usuari del PC.
    Retorna el primer trobat, o None si no existeix.
    """
    home = os.path.expanduser("~")
    userprofile = os.environ.get("USERPROFILE", home)

    search_paths = [
        # Documents (català/castellà/anglès)
        os.path.join(userprofile, "Documents", JSON_FILENAME),
        os.path.join(userprofile, "Documentos", JSON_FILENAME),
        os.path.join(userprofile, "My Documents", JSON_FILENAME),
        # Escriptori / Desktop
        os.path.join(userprofile, "Desktop", JSON_FILENAME),
        os.path.join(userprofile, "Escritorio", JSON_FILENAME),
        os.path.join(userprofile, "Escriptori", JSON_FILENAME),
        # Descàrregues / Downloads
        os.path.join(userprofile, "Downloads", JSON_FILENAME),
        os.path.join(userprofile, "Descargas", JSON_FILENAME),
        os.path.join(userprofile, "Descàrregues", JSON_FILENAME),
        # Carpeta de l'usuari directament
        os.path.join(userprofile, JSON_FILENAME),
        os.path.join(home, JSON_FILENAME),
        # OneDrive (multilingüe)
        os.path.join(userprofile, "OneDrive", "Documents", JSON_FILENAME),
        os.path.join(userprofile, "OneDrive", "Documentos", JSON_FILENAME),
        os.path.join(userprofile, "OneDrive", JSON_FILENAME),
    ]

    # Cerca dinàmica: qualsevol subcarpeta de Documents que contingui el fitxer
    docs_glob_patterns = [
        os.path.join(userprofile, "Documents", "**", JSON_FILENAME),
        os.path.join(userprofile, "Documentos", "**", JSON_FILENAME),
        os.path.join(userprofile, "OneDrive", "**", JSON_FILENAME),
    ]

    for path in search_paths:
        if os.path.isfile(path):
            return path

    for pattern in docs_glob_patterns:
        matches = glob.glob(pattern, recursive=True)
        if matches:
            # Retorna el més recent
            return max(matches, key=os.path.getmtime)

    return None


def find_shared_params():
    """
    Cerca el fitxer de paràmetres compartits en múltiples ubicacions.
    Retorna el primer trobat, o None si no existeix.
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
        os.path.join(userprofile, "OneDrive", "Documentos", SHARED_PARAMS_FILE),
    ]

    for path in search_paths:
        if os.path.isfile(path):
            return path

    # Cerca recursiva com a últim recurs
    for base in [os.path.join(userprofile, "Documents"),
                 os.path.join(userprofile, "Documentos"),
                 os.path.join(userprofile, "OneDrive")]:
        matches = glob.glob(os.path.join(base, "**", SHARED_PARAMS_FILE), recursive=True)
        if matches:
            return max(matches, key=os.path.getmtime)

    return None


def find_revit_templates():
    """
    Cerca la carpeta de plantilles de Revit per a qualsevol versió instal·lada
    (2020–2030), primer en English i després en Spanish/Metric.
    Retorna la primera carpeta vàlida trobada.
    """
    program_data = os.environ.get("PROGRAMDATA", r"C:\ProgramData")

    candidates = []
    for year in range(2030, 2019, -1):  # De més recent a més antic
        for lang in ["English", "Spanish", "Metric Library"]:
            candidates.append(
                os.path.join(program_data, "Autodesk", "RVT {}".format(year),
                             "Family Templates", lang)
            )

    for path in candidates:
        if os.path.isdir(path):
            return path

    # Fallback: cerca qualsevol carpeta Family Templates
    rvt_glob = os.path.join(program_data, "Autodesk", "RVT *", "Family Templates", "*")
    matches = glob.glob(rvt_glob)
    if matches:
        return matches[0]

    return None


def resolve_output_folder(raw_path, fallback_docs):
    """Expandeix variables d'entorn (%USERPROFILE%, etc.) del path del JSON."""
    expanded = os.path.expandvars(raw_path)
    if expanded == raw_path and not os.path.isabs(expanded):
        # Si no té variables ni és absolut, posa'l a Documents
        return os.path.join(fallback_docs, expanded)
    return expanded


def resolve_template(template_filename, templates_folder):
    """Cerca la plantilla en English i en Spanish com a fallback."""
    path_en = os.path.join(templates_folder, template_filename)
    if os.path.exists(path_en):
        return path_en
    # Fallback: busca en les carpetes germanes (Spanish, Metric Library)
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
    skipped = 0
    errors  = []
    total   = len(equips)

    for i, equip in enumerate(equips):
        nom      = equip["nom"]
        cat      = equip["cat"]
        params   = equip["params"]
        template = equip["template"]

        output.print_md("**[{}/{}]** {} — *{}*".format(i + 1, total, nom, cat))

        # Cerca plantilla
        template_path = resolve_template(template, templates_folder)
        if template_path is None:
            msg = "Plantilla no trobada: " + template
            errors.append(nom + ": " + msg)
            output.print_md("  ⚠️ " + msg)
            continue

        out_path = os.path.join(output_folder, nom + ".rfa")
        if os.path.exists(out_path):
            output.print_md("  ⏭ Ja existeix, saltant.")
            skipped += 1
            continue

        # Obre plantilla
        try:
            fam_doc = app.NewFamilyDocument(template_path)
        except Exception as e:
            msg = "Error obrint plantilla: " + str(e)
            errors.append(nom + ": " + msg)
            output.print_md("  ❌ " + msg)
            continue

        # Afegeix paràmetres compartits
        fam_mgr = fam_doc.FamilyManager
        t = Transaction(fam_doc, "Afegir params CBT")
        t.Start()
        try:
            for pname in params:
                if pname not in param_index:
                    output.print_md("  ⚠️ Paràmetre no trobat al fitxer compartit: " + pname)
                    continue
                try:
                    fam_mgr.AddParameter(param_index[pname], _PARAM_GROUP, True)
                except Exception:
                    pass  # Ja existeix o incompatible
            t.Commit()
        except Exception as e:
            t.RollBack()
            msg = "Error afegint paràmetres: " + str(e)
            errors.append(nom + ": " + msg)
            output.print_md("  ❌ " + msg)
            fam_doc.Close(False)
            continue

        # Guarda
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

    # Resum final
    output.print_md("---")
    output.print_md("## Resultat final")
    output.print_md("- ✅ Creades: **{}**".format(created))
    output.print_md("- ⏭ Saltades (ja existien): **{}**".format(skipped))
    output.print_md("- ❌ Errors: **{}**".format(len(errors)))
    if errors:
        output.print_md("**Detall errors:**")
        for e in errors:
            output.print_md("  - " + e)
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
    _PARAM_GROUP = GroupTypeId.Data
else:
    from Autodesk.Revit.DB import BuiltInParameterGroup
    _PARAM_GROUP = BuiltInParameterGroup.PG_DATA
# ──────────────────────────────────────────────────────────────

# ── Cerca automàtica del JSON de configuració ──
output.print_md("## Cercant fitxers de configuració CBT...")

json_path = find_json_config()
if json_path is None:
    forms.alert(
        "No s'ha trobat el fitxer: {}\n\n"
        "S'ha cercat a:\n"
        "  • Documents / Documentos\n"
        "  • Escriptori / Desktop / Escritorio\n"
        "  • Descàrregues / Downloads / Descargas\n"
        "  • OneDrive\n\n"
        "Descarrega'l des de la plataforma TaulaMaster CBT-BIM\n"
        "i guarda'l en alguna d'aquestes ubicacions.".format(JSON_FILENAME),
        exitscript=True
    )

output.print_md("  ✅ JSON trobat: `{}`".format(json_path))

shared_params_path = find_shared_params()
if shared_params_path is None:
    forms.alert(
        "No s'ha trobat el fitxer: {}\n\n"
        "Posa'l a la carpeta Documents de l'usuari.".format(SHARED_PARAMS_FILE),
        exitscript=True
    )

output.print_md("  ✅ Paràmetres compartits: `{}`".format(shared_params_path))

# ── Llegeix JSON ──
output.print_md("## Llegint configuració...")
with io.open(json_path, "r", encoding="utf-8") as f:
    config = json.load(f)

equips = config["equipments"]

# ── Plantilles Revit: prioritat JSON > autodetecció ──
templates_folder = config.get("templates_folder", None)
if templates_folder and not os.path.isdir(os.path.expandvars(templates_folder)):
    output.print_md("  ⚠️ Carpeta de plantilles del JSON no trobada: `{}` — cercant automàticament...".format(templates_folder))
    templates_folder = None

if not templates_folder:
    templates_folder = find_revit_templates()
    if templates_folder:
        output.print_md("  ✅ Plantilles Revit autodetectades: `{}`".format(templates_folder))
    else:
        forms.alert(
            "No s'ha trobat cap instal·lació de Revit amb plantilles de família.\n\n"
            "Assegura't que Revit està instal·lat correctament.",
            exitscript=True
        )
else:
    templates_folder = os.path.expandvars(templates_folder)

# ── Carpeta de sortida ──
docs_folder = (
    os.path.join(os.environ.get("USERPROFILE", os.path.expanduser("~")), "Documents")
    if os.path.isdir(os.path.join(os.environ.get("USERPROFILE", ""), "Documents"))
    else os.path.join(os.path.expanduser("~"), "Documentos")
)

raw_output = config.get("output_folder", DEFAULT_OUTPUT_NAME)
output_folder = resolve_output_folder(raw_output, docs_folder)

# ── Informació de la sessió ──
output.print_md("**{} famílies a crear.**".format(len(equips)))
output.print_md("**Generat:** {}".format(config.get("generated_at", "—")))
output.print_md("**Plantilles:** `{}`".format(templates_folder))
output.print_md("**Sortida:** `{}`".format(output_folder))

# Resum de categories
cat_counts = {}
for eq in equips:
    cat_counts[eq["cat"]] = cat_counts.get(eq["cat"], 0) + 1
cat_summary = ", ".join(
    "{} {}".format(v, k) for k, v in sorted(cat_counts.items())
)
output.print_md("**Categories:** {}".format(cat_summary))

# ── Confirmació ──
res = forms.alert(
    "Es crearan {} famílies .rfa\n\n"
    "JSON: {}\n"
    "Plantilles: {}\n"
    "Sortida: {}\n\n"
    "Si s'interromp, pots tornar a executar-lo:\n"
    "les famílies ja creades es saltaran automàticament.\n\n"
    "Continuar?".format(len(equips), json_path, templates_folder, output_folder),
    ok=True, cancel=True
)
if not res:
    script.exit()

output.print_md("## Creant {} famílies CBT...".format(len(equips)))
run(equips, templates_folder, output_folder, shared_params_path, app, output)
