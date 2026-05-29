# BIM Sync USB - CCB Serveis Medioambientals  v10.1
# Flux simplificat:
#   1 · Copia _ENT/_EST/_MEP del Desktop Connector → USB
#   2 · Puja _MASTER del USB → ACC (API) + xRefs + processa + publica Supabase
# i puja els _MASTER de tornada a Forma.
# [NOU] Opció 4: Traduir _MASTER a Model Derivative (SVF2) per al visor 3D
# [NOU] Opció 6: Generar script Dynamo per recarregar links
# [NOU] Opció 7: Batch reload links a TOTS els MASTERs del projecte (via Revit Journal)
#
# v10.0 — Dues millores fonamentals a l'opció 4:
#   [FIX 1] Processament automàtic: ja NO cal entrar manualment a cada _MASTER a ACC.
#            El script ara fa POST /versions?copyFrom amb xRefs → ACC inicia la traducció
#            automàticament en pujar el fitxer.
#   [FIX 2] Rutes dels vincles via xRefs API: el _MASTER ara coneix la ruta real dels
#            fitxers _ENT/_EST/_MEP a ACC (via version_id). ACC tradueix el model federat
#            correctament (els vincles es resolen pel version_id, no per ruta local).
#   [NOU]   Funció obte_version_id_per_nom(): busca el version_id d'un fitxer a ACC
#   [NOU]   Funció registra_xrefs_master(): POST /versions?copyFrom + refs (xRefs)
#   [NOU]   opcio_traduir() ara puja disciplines + master + registra xRefs en seqüència
#
# v9.9 — Correccions opció 7 (PYREVIT_RELOAD_SCRIPT):
#   Fix 1: LoadFrom() ara s'executa dins d'una Transaction (obligatori a Revit 2024+)
#   Fix 2: LoadFrom() usa ModelPath (ModelPathUtils) en lloc de FilePath (deprecat/eliminat)
#   Fix 3: Lookup del nom del link via GetExternalFileReference() primer (més fiable)
#   Fix 4: OpenDocumentFile usa DetachFromCentralOption.DoNotDetach per evitar
#           que el model s'obri com a detached (que impedia recarregar els links)
#
# v9.10 — Fix crític: una Transaction per link (però tx.Start() també fallava)
#
# v9.11 — Fix definitiu: SENSE cap Transaction manual
#   Fix 6: LoadFrom() directe dins del TransactionGroup extern de pyRevit.
#
# v9.13 — Fix: links apareixien com ✕ en obrir el MASTER després de l'script
#   Causa: LoadFrom() carrega el link en memòria però NO modifica el flag intern
#          que Revit desa al fitxer per recordar si un link ha d'estar carregat.
#          Save() desava correctament però amb el flag 'Unloaded' encara actiu.
#   Fix 8: Usar Reload() en comptes de LoadFrom(). Reload() actualitza tant
#          l'estat en memòria com el flag persistit. Si Reload() falla (ruta
#          desactualitzada), fer LoadFrom() primer per actualitzar la ruta i
#          després Reload() per fixar el flag.
#
# v9.15 — Intents de canviar AttachmentType i PathType (propietats read-only a l'API)
#
# v9.16 — Fix arrel: els links no tenien RevitLinkInstance (no estaven inserits)
#   Fix 11: Després de carregar cada link, comprova si té instàncies al model.
#           Si no en té cap, crea una RevitLinkInstance a l'origen (0,0,0) amb
#           Transform.Identity — respecta l'Internal Origin de cada fitxer.
#
# Ruta origen : C:/Users/mcenteno/DC/ACCDocs/CCB Serveis medioambientals/BESSO-DIGITAL/Project Files
# Disc USB    : F:
#
# COM EXECUTAR AMB VS CODE:
#   1. pip install requests   (només el primer cop, per a les opcions 4 i 5)
#   2. Obre la carpeta on has desat aquest fitxer
#   3. Clic a bim_sync_usb.py
#   4. Prem F5  (o el boto Run Python File a dalt a la dreta)
#   5. El terminal integrat de VS Code mostrara el menu

import os
import shutil
import sys
import time
import base64
from pathlib import Path
from datetime import datetime

# ──────────────────────────────────────────────
# CONFIGURACIÓ  ← edita aquí si cal
# ──────────────────────────────────────────────
ORIGEN = Path(r"C:\Users\mcenteno\DC\ACCDocs\CCB Serveis medioambientals\BESSO-DIGITAL\Project Files")
USB    = Path(r"F:")
SUFIXOS_COPIA = (
    "_ENT", "_EST", "_MEP",          # patró estàndard:  _FM_ENT, _ENT, _ENT_2022, _ENT_2024
    "_ENT_FM", "_EST_FM", "_MEP_FM", # patró invers:     _ENT_FM (ED008 Caldes)
    "_COOR",                          # coordinació:      _AB_COOR_2024
    "_STR",                           # estructura:       _FM_STR_2022
)
SUFIX_MASTER  = "_MASTER"

# ── Credencials APS (per a opcions 4 i 5) ──
# Obté CLIENT_ID i CLIENT_SECRET a: https://aps.autodesk.com/myapps
APS_CLIENT_ID     = "ye2pbSTsDbRUqrbehM2XlYRenoKInLyyVmYjsERtuMqqpRI7"
APS_CLIENT_SECRET = "DyrvP8cxWaHHGoEeql7W1dMqIQiF3KNAI4DxVGgHsvYIojzmNeZcARKsn9NObHsn"

# Nom de la carpeta ACC on estan els MASTERs (es detecta automàticament)
ACC_CARPETA_MASTERS = "Project Files"

# El log es desa al costat d'aquest script
LOG_PATH = Path(__file__).parent / "bim_sync_log.txt"

# ──────────────────────────────────────────────
# COLORS PER CONSOLA (Windows 10+  /  VS Code)
# ──────────────────────────────────────────────
os.system("")   # activa ANSI a Windows
VERD    = "\033[92m"
GROC    = "\033[93m"
VERMELL = "\033[91m"
BLAU    = "\033[94m"
CYAN    = "\033[96m"
RESET   = "\033[0m"
NEGRETA = "\033[1m"

# ──────────────────────────────────────────────
# LOG  (consola + fitxer .txt)
# ──────────────────────────────────────────────
_log_lines = []  # list[str]

def log(msg: str, color: str = RESET):
    hora = datetime.now().strftime("%H:%M:%S")
    print(f"{color}[{hora}] {msg}{RESET}")
    _log_lines.append(f"[{hora}] {msg}")

def separador():
    linea = "─" * 60
    print(linea)
    _log_lines.append(linea)

def desar_log(opcio: str):
    try:
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write("\n")
            f.write(f"{'═'*60}\n")
            f.write(f"  SESSIÓ  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  ·  Opció: {opcio}\n")
            f.write(f"{'═'*60}\n")
            for linia in _log_lines:
                f.write(linia + "\n")
        print(f"{VERD}  📄  Log desat a: {LOG_PATH}{RESET}")
    except Exception as e:
        print(f"{VERMELL}  No s'ha pogut desar el log: {e}{RESET}")

# ──────────────────────────────────────────────
# FUNCIONS ORIGINALS (sense canvis)
# ──────────────────────────────────────────────

def trobar_fitxers_bim(carpeta_origen: Path, sufixos: tuple):
    """Busca recursivament tots els .rvt que acabin amb els sufixos indicats."""
    trobats = []
    for rvt in carpeta_origen.rglob("*.rvt"):
        stem_up = rvt.stem.upper()
        if any(s in stem_up for s in sufixos) and "_MASTER" not in stem_up:
            trobats.append(rvt)
    return sorted(trobats)


def copiar_al_usb(fitxers, origen: Path, usb: Path):
    """
    Copia els fitxers al USB mantenint l'estructura de carpetes relativa.
    Retorna la llista de fitxers copiats correctament.
    """
    copiats = []
    for src in fitxers:
        rel = src.relative_to(origen)
        dst = usb / "BIM_WORK" / rel
        dst.parent.mkdir(parents=True, exist_ok=True)

        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            log(f"  ⟳  Ja actualitzat: {rel}", GROC)
            copiats.append(dst)
            continue

        try:
            shutil.copy2(src, dst)
            mida = src.stat().st_size / (1024 * 1024)
            log(f"  ✓  {rel}  ({mida:.1f} MB)", VERD)
            copiats.append(dst)
        except Exception as e:
            log(f"  ✗  Error copiant {rel}: {e}", VERMELL)

    return copiats



# ──────────────────────────────────────────────
# [NOU] FUNCIONS APS — autenticació i traducció
# ──────────────────────────────────────────────

def _importar_requests():
    """Importa requests o mostra instruccions si no està instal·lat."""
    try:
        import requests
        return requests
    except ImportError:
        log("  ✗  Falta el paquet 'requests'. Executa:", VERMELL)
        log("       pip install requests", GROC)
        return None


_token_cache = {"token": None, "expira": 0}

def obtenir_token(requests) -> str:
    """
    Obté el token d'autenticació APS.
    Si APS_CLIENT_ID està configurat, usa 2-legged (app).
    Si no, demana el token personal manualment (copiat des del navegador).
    """
    ara = time.time()
    if _token_cache["token"] and ara < _token_cache["expira"] - 60:
        return _token_cache["token"]

    # ── Opció A: Token manual (3-legged, credencials de l'usuari) ────────────
    # Més potent: usa els teus permisos d'ACC directament.
    # Com obtenir-lo:
    #   1. Obre Chrome → F12 → pestanya Network
    #   2. Ves a acc.autodesk.com i obre el projecte
    #   3. Busca qualsevol petició a api.autodesk.com
    #   4. Headers → Authorization: Bearer XXXXX  ← copia el token
    if APS_CLIENT_ID == "EL_TEU_CLIENT_ID":
        print(f"""
{NEGRETA}{'─'*60}
  🔑  TOKEN D'AUTENTICACIÓ APS
{'─'*60}{RESET}
  Com obtenir el token des del navegador:
    1. Obre Chrome i ves a acc.autodesk.com
    2. Prem F12 → pestanya "Network"
    3. Navega per qualsevol carpeta del projecte
    4. Busca una petició a "api.autodesk.com"
    5. Clica-la → "Headers" → busca "Authorization"
    6. Copia el text llarg després de "Bearer "
{'─'*60}""")
        token_manual = input("  Enganxa el token i prem Enter:\n  > ").strip()
        token_manual = token_manual.replace("Bearer ", "").strip()
        if not token_manual:
            log("  ✗  Token buit.", VERMELL)
            return None
        # Guarda amb expiració d'1 hora (tokens de navegador solen durar ~1h)
        _token_cache["token"]  = token_manual
        _token_cache["expira"] = ara + 3600
        log("  ✅  Token manual configurat.", VERD)
        return token_manual

    # ── Opció B: 2-legged amb CLIENT_ID + CLIENT_SECRET ───────────────────────
    log("  🔑  Autenticant amb APS (2-legged)...", BLAU)
    try:
        r = requests.post(
            "https://developer.api.autodesk.com/authentication/v2/token",
            data={"grant_type": "client_credentials",
                  "scope": "data:read data:write data:create"},
            auth=(APS_CLIENT_ID, APS_CLIENT_SECRET),
            timeout=30,
        )
        r.raise_for_status()
        d = r.json()
        _token_cache["token"]  = d["access_token"]
        _token_cache["expira"] = ara + d.get("expires_in", 3600)
        log("  ✅  Token APS obtingut.", VERD)
        return _token_cache["token"]
    except Exception as e:
        log(f"  ✗  Error autenticació: {e}", VERMELL)
        return None


def caps(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def seleccionar_projecte_acc(requests, token: str) -> tuple:
    """Mostra hubs i projectes ACC i retorna (project_id, folder_id)."""
    # Hubs
    try:
        r = requests.get("https://developer.api.autodesk.com/project/v1/hubs",
                         headers=caps(token), timeout=30)
        r.raise_for_status()
        hubs = r.json().get("data", [])
    except Exception as e:
        log(f"  ✗  Error obtenint hubs: {e}", VERMELL)
        return None

    if not hubs:
        log("  ✗  No s'han trobat hubs ACC.", VERMELL)
        return None

    hub_id = hubs[0]["id"]
    if len(hubs) > 1:
        print(f"\n{NEGRETA}  Selecciona el hub:{RESET}")
        for i, h in enumerate(hubs, 1):
            print(f"    {i} · {h['attributes']['name']}")
        try:
            hub_id = hubs[int(input("  Número: ").strip()) - 1]["id"]
        except Exception:
            log("  Selecció invàlida.", VERMELL)
            return None
    else:
        log(f"  Hub: {hubs[0]['attributes']['name']}", BLAU)

    # Projectes
    try:
        r = requests.get(
            f"https://developer.api.autodesk.com/project/v1/hubs/{hub_id}/projects",
            headers=caps(token), timeout=30)
        r.raise_for_status()
        projectes = r.json().get("data", [])
    except Exception as e:
        log(f"  ✗  Error obtenint projectes: {e}", VERMELL)
        return None

    print(f"\n{NEGRETA}  Selecciona el projecte ACC:{RESET}")
    for i, p in enumerate(projectes, 1):
        print(f"    {i} · {p['attributes']['name']}")
    try:
        idx = int(input("  Número: ").strip()) - 1
        project_id = projectes[idx]["id"]
        log(f"  Projecte: {projectes[idx]['attributes']['name']}", BLAU)
    except Exception:
        log("  Selecció invàlida.", VERMELL)
        return None

    # Carpeta arrel
    try:
        r = requests.get(
            f"https://developer.api.autodesk.com/project/v1/hubs/{hub_id}/projects/{project_id}/topFolders",
            headers=caps(token), timeout=30)
        r.raise_for_status()
        for item in r.json().get("data", []):
            if ACC_CARPETA_MASTERS.lower() in item.get("attributes", {}).get("name", "").lower():
                folder_id = item["id"]
                log(f"  Carpeta: {item['attributes']['name']}", BLAU)
                return project_id, folder_id
        log(f"  ✗  No s'ha trobat la carpeta '{ACC_CARPETA_MASTERS}'.", VERMELL)
        return None
    except Exception as e:
        log(f"  ✗  Error obtenint carpetes: {e}", VERMELL)
        return None


def pujar_fitxer_acc(requests, token: str, project_id: str, folder_id: str, fitxer: Path) -> dict:
    """
    Puja un fitxer a ACC.
    Retorna dict amb {object_id, item_id, version_id} o None si falla.
    item_id i version_id són necessaris per registrar xRefs dels vincles.
    """
    nom  = fitxer.name
    mida = fitxer.stat().st_size / (1024 * 1024)
    log(f"  ↑  Pujant {nom} ({mida:.1f} MB)...", CYAN)

    # Sol·licitar storage i URL de pujada (ACC EMEA usa signed S3 URLs)
    try:
        r = requests.post(
            f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/storage",
            headers={**caps(token), "Content-Type": "application/vnd.api+json"},
            json={"jsonapi": {"version": "1.0"}, "data": {
                "type": "objects", "attributes": {"name": nom},
                "relationships": {"target": {"data": {"type": "folders", "id": folder_id}}},
            }},
            timeout=30,
        )
        r.raise_for_status()
        resp_json = r.json()
        object_id = resp_json["data"]["id"]
        # object_id format: urn:adsk.objects:os.object:BUCKET/FILENAME
        # Extraiem bucket i object key per obtenir la signed URL
        parts     = object_id.replace("urn:adsk.objects:os.object:", "")
        bucket    = parts.split("/")[0]
        obj_key   = "/".join(parts.split("/")[1:])
    except Exception as e:
        log(f"    ✗  Error sol·licitant storage: {e}", VERMELL)
        return None

    # Obtenir signed URL per pujar el binari
    try:
        r_sign = requests.get(
            f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{requests.utils.quote(obj_key, safe='')}/signeds3upload",
            headers=caps(token),
            params={"minutesExpiration": 60},
            timeout=30,
        )
        r_sign.raise_for_status()
        sign_data  = r_sign.json()
        upload_url = sign_data["urls"][0]
        upload_key = sign_data.get("uploadKey", "")
    except Exception as e:
        log(f"    ✗  Error obtenint signed URL: {e}", VERMELL)
        return None

    # PUT binari a S3
    try:
        with fitxer.open("rb") as f:
            requests.put(upload_url, data=f, timeout=600).raise_for_status()
    except Exception as e:
        log(f"    ✗  Error pujant binari: {e}", VERMELL)
        return None

    # Finalitzar la pujada (necessari per ACC EMEA amb signed S3 URLs)
    try:
        r_fin = requests.post(
            f"https://developer.api.autodesk.com/oss/v2/buckets/{bucket}/objects/{requests.utils.quote(obj_key, safe='')}/signeds3upload",
            headers={**caps(token), "Content-Type": "application/json"},
            json={"uploadKey": upload_key},
            timeout=30,
        )
        r_fin.raise_for_status()
    except Exception as e:
        log(f"    ✗  Error finalitzant pujada: {e}", VERMELL)
        return None

    # Crear o actualitzar item a ACC — retorna item_id + version_id per als xRefs
    try:
        # Comprova si ja existeix a la carpeta
        contingut = requests.get(
            f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/folders/{folder_id}/contents",
            headers=caps(token), timeout=30).json().get("data", [])
        item_existent = next(
            (x["id"] for x in contingut if x.get("attributes", {}).get("displayName") == nom), None)

        if item_existent:
            # Nova versió d'un fitxer existent
            r2 = requests.post(
                f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions",
                headers={**caps(token), "Content-Type": "application/vnd.api+json"},
                json={"jsonapi": {"version": "1.0"}, "data": {
                    "type": "versions",
                    "attributes": {"name": nom, "extension": {"type": "versions:autodesk.bim360:File", "version": "1.0"}},
                    "relationships": {
                        "item":    {"data": {"type": "items",   "id": item_existent}},
                        "storage": {"data": {"type": "objects", "id": object_id}},
                    },
                }}, timeout=30)
            r2.raise_for_status()
            version_id = r2.json()["data"]["id"]
            item_id    = item_existent
        else:
            # Item nou
            r2 = requests.post(
                f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/items",
                headers={**caps(token), "Content-Type": "application/vnd.api+json"},
                json={"jsonapi": {"version": "1.0"},
                      "data": {
                          "type": "items",
                          "attributes": {"displayName": nom, "extension": {"type": "items:autodesk.bim360:File", "version": "1.0"}},
                          "relationships": {
                              "tip":    {"data": {"type": "versions", "id": "1"}},
                              "parent": {"data": {"type": "folders",  "id": folder_id}},
                          },
                      },
                      "included": [{"type": "versions", "id": "1",
                                    "attributes": {"name": nom, "extension": {"type": "versions:autodesk.bim360:File", "version": "1.0"}},
                                    "relationships": {"storage": {"data": {"type": "objects", "id": object_id}}}}],
                      }, timeout=30)
            r2.raise_for_status()
            resp_data = r2.json()
            item_id    = resp_data["data"]["id"]
            version_id = resp_data.get("included", [{}])[0].get("id", "")

        log(f"    ✅  {nom} pujat a ACC.", VERD)
        return {"object_id": object_id, "item_id": item_id, "version_id": version_id}
    except Exception as e:
        try:
            print(f"    DEBUG 403 body: {r2.status_code} {r2.text[:300]}")
        except Exception:
            pass
        log(f"    ✗  Error creant item: {e}", VERMELL)
        return None


def obte_version_id_per_nom(requests, token: str, project_id: str, folder_id: str, nom_fitxer: str) -> str:
    """
    Retorna el version_id (tip) del fitxer amb nom_fitxer a la carpeta folder_id.
    Necessari per registrar xRefs dels vincles al _MASTER.
    """
    try:
        contingut = requests.get(
            f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/folders/{folder_id}/contents",
            headers=caps(token), timeout=30
        ).json().get("data", [])
        def normalitza_nom(s):
            return s.lower().replace("-", "_").replace(" ", "_")

        item = next(
            (x for x in contingut
             if x.get("type") == "items" and
                normalitza_nom(x.get("attributes", {}).get("displayName", "")) ==
                normalitza_nom(nom_fitxer)),
            None
        )
        if item:
            log(f"      🔍  Nom local '{nom_fitxer}' → trobat a ACC com '{item.get('attributes',{}).get('displayName','')}'", CYAN)
        if not item:
            return None
        item_id = item["id"]
        # Obté el tip (versió actual) de l'item
        r_tip = requests.get(
            f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/items/{requests.utils.quote(item_id, safe='')}/tip",
            headers=caps(token), timeout=30
        )
        r_tip.raise_for_status()
        return r_tip.json()["data"]["id"]
    except Exception as e:
        log(f"    ⚠️  No s'ha pogut obtenir version_id de {nom_fitxer}: {e}", GROC)
        return None


def registra_xrefs_master(requests, token: str, project_id: str, folder_id: str,
                           master_item_id: str, master_version_id: str,
                           noms_disciplines: list) -> bool:
    """
    [NOU] Registra les xRefs (vincles) entre el _MASTER i els fitxers de disciplina a ACC.

    Per a cada fitxer de disciplina (_ENT, _EST, _MEP), fa una nova versió del _MASTER
    (via POST /versions?copyFrom) que inclou el camp "refs" amb els version_id de cada
    fitxer de disciplina. Això permet que ACC tradueixi el _MASTER federat correctament.

    Estructura del payload (font: APS blog BIM360 xRefs):
      POST /data/v1/projects/{project_id}/versions?copyFrom={escaped_version_id}
      {
        "jsonapi": {"version": "1.0"},
        "data": {
          "type": "versions",
          "relationships": {
            "refs": {
              "data": [
                {
                  "type": "versions",
                  "id": "{version_id_ENT}",
                  "meta": {
                    "refType": "xrefs",
                    "direction": "from",
                    "extension": {
                      "type": "xrefs:autodesk.core:Xref",
                      "version": "1.1",
                      "data": {"nestedType": "overlay"}
                    }
                  }
                },
                ... (un per cada disciplina)
              ]
            }
          }
        }
      }
    """
    if not noms_disciplines:
        log("    ⚠️  Cap fitxer de disciplina per registrar xRefs.", GROC)
        return False

    # Obté version_id de cada fitxer de disciplina a la mateixa carpeta
    refs_data = []
    for nom_disc in noms_disciplines:
        # obte_version_id_per_nom ja fa comparació case-insensitive
        ver_id = obte_version_id_per_nom(requests, token, project_id, folder_id, nom_disc)
        if ver_id:
            refs_data.append({
                "type": "versions",
                "id": ver_id,
                "meta": {
                    "refType": "xrefs",
                    "direction": "from",
                    "extension": {
                        "type": "xrefs:autodesk.core:Xref",
                        "version": "1.1",
                        "data": {"nestedType": "overlay"}
                    }
                }
            })
            log(f"      🔗  xRef trobat: {nom_disc}", VERD)
        else:
            log(f"      ⚠️  No trobat a ACC: {nom_disc}", GROC)

    if not refs_data:
        log("    ✗  No s'ha pogut obtenir cap xRef. El _MASTER es processarà sense vincles.", VERMELL)
        return False

    # POST /versions?copyFrom={version_id_master} — crea nova versió amb xRefs
    # Això alhora: (1) registra els vincles i (2) dispara el processament a ACC
    escaped_ver = requests.utils.quote(master_version_id, safe="")
    try:
        r = requests.post(
            f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/versions"
            f"?copyFrom={escaped_ver}",
            headers={**caps(token), "Content-Type": "application/vnd.api+json"},
            json={
                "jsonapi": {"version": "1.0"},
                "data": {
                    "type": "versions",
                    "relationships": {
                        "refs": {"data": refs_data}
                    }
                }
            },
            timeout=30
        )
        r.raise_for_status()
        nova_versio = r.json()["data"]["id"]
        log(f"    ✅  xRefs registrats ({len(refs_data)} vincles). Nova versió: {nova_versio[:40]}...", VERD)
        log(f"    🚀  ACC iniciarà el processament del _MASTER automàticament.", VERD)
        return nova_versio
    except Exception as e:
        log(f"    ✗  Error registrant xRefs: {e}", VERMELL)
        try:
            log(f"       Resposta: {r.status_code} {r.text[:200]}", GROC)
        except Exception:
            pass
        return False


def traduir_master(requests, token: str, object_id: str, nom: str) -> str:
    """Llança traducció SVF2 via Model Derivative API i retorna l'URN."""
    urn = base64.urlsafe_b64encode(object_id.encode()).decode().rstrip("=")
    log(f"  🔄  Traduint {nom}...", CYAN)
    try:
        r = requests.post(
            "https://developer.api.autodesk.com/modelderivative/v2/designdata/job",
            headers={**caps(token), "Content-Type": "application/json", "x-ads-force": "true"},
            json={"input": {"urn": urn},
                  "output": {"formats": [{"type": "svf2", "views": ["2d", "3d"]}]}},
            timeout=30,
        )
        r.raise_for_status()
        log(f"    ✅  Job acceptat. URN: {urn[:30]}...", VERD)
        return urn
    except Exception as e:
        log(f"    ✗  Error traduint: {e}", VERMELL)
        return None


def esperar_traduccions(requests, token: str, urns):
    """
    Polling fins que totes les traduccions acabin.
    Usa token 2-legged viewables:read per a Model Derivative.
    En mode token manual, surt sense bloquejar (ACC processa sol).
    """
    if not urns:
        return

    # Model Derivative necessita token 2-legged amb scope viewables:read
    # El token de Data Management (3-legged o 2-legged data:read) retorna 401
    token_md = _obte_token_2legged_viewables(requests)
    if not token_md:
        log(f"  ℹ️  Polling omès: token manual no té scope viewables:read.", GROC)
        log(f"  ✅  ACC processarà els {len(urns)} MASTER(s) automàticament.", VERD)
        log(f"  ℹ️  Comprova l'estat a acc.autodesk.com al cap d'uns minuts.", GROC)
        return

    log(f"  ⏳  Esperant {len(urns)} traducció(ns) (comprova cada 20s)...", CYAN)
    pendents = list(urns)
    while pendents:
        time.sleep(20)
        nous_pendents = []
        for urn, nom in pendents:
            try:
                r = requests.get(
                    f"https://developer.api.autodesk.com/modelderivative/v2/designdata/{urn}/manifest",
                    headers=caps(token_md), timeout=30)
                r.raise_for_status()
                m = r.json()
                status = m.get("status", "")
                if status == "success":
                    log(f"    ✅  {nom}: traduït.", VERD)
                elif status == "failed":
                    log(f"    ✗  {nom}: traducció fallida.", VERMELL)
                else:
                    print(f"\r    ⏳  {nom}: {status} {m.get('progress','')}   ", end="", flush=True)
                    nous_pendents.append((urn, nom))
            except Exception as e:
                log(f"    ⚠️  {nom}: error consultant: {e}", GROC)
                nous_pendents.append((urn, nom))
        pendents = nous_pendents


def obte_folder_id_per_path(requests, token: str, project_id: str, root_folder_id: str,
                             parts: list) -> str:
    """
    Navega la jerarquia de carpetes ACC seguint la llista de noms 'parts'.
    Ex: parts=["001_GRANOLLERS","MGR01_CAN-REI","001_MODEL-BIM"]
    Retorna el folder_id de la carpeta final, o None si no es troba.

    Estratègia de cerca: comparació flexible (minúscules + guions = guions baixos)
    perquè els noms a ACC i al sistema de fitxers local poden diferir lleugerament.
    """
    def normalitza(s):
        return s.lower().replace("-", "_").replace(" ", "_")

    folder_id_actual = root_folder_id
    for nom_part in parts:
        try:
            r = requests.get(
                f"https://developer.api.autodesk.com/data/v1/projects/{project_id}"
                f"/folders/{folder_id_actual}/contents",
                headers=caps(token), timeout=30
            )
            r.raise_for_status()
            subcarpetes = [x for x in r.json().get("data", []) if x.get("type") == "folders"]
            trobada = next(
                (c for c in subcarpetes
                 if normalitza(c.get("attributes", {}).get("displayName", "")) == normalitza(nom_part)),
                None
            )
            if not trobada:
                noms = [c.get("attributes", {}).get("displayName", "") for c in subcarpetes]
                log(f"    ✗  Carpeta '{nom_part}' no trobada. Subcarpetes disponibles: {noms[:10]}", VERMELL)
                return None
            folder_id_actual = trobada["id"]
        except Exception as e:
            log(f"    ✗  Error navegant a '{nom_part}': {e}", VERMELL)
            return None
    return folder_id_actual


def obte_folder_id_model_bim(requests, token: str, project_id: str, root_folder_id: str,
                               src_master: Path) -> str:
    """
    A partir de la ruta local del _MASTER, dedueix la ruta relativa a ACC i
    retorna el folder_id de la carpeta 001_MODEL-BIM corresponent.

    Ruta local:  C:/Users/.../Project Files/001_GRANOLLERS/MGR01_CAN-REI/001_MODEL-BIM/
    root_folder: carpeta "Project Files" a ACC
    Parts:       ["001_GRANOLLERS", "MGR01_CAN-REI", "001_MODEL-BIM"]
    """
    try:
        # Troba la part del path a partir de "Project Files" (o "BIM_WORK" si ve del USB)
        parts_local = list(src_master.parent.parts)
        # Cerca l'índex de la carpeta arrel (Project Files o BIM_WORK)
        noms_arrel = {"project files", "bim_work"}
        idx_arrel = next(
            (i for i, p in enumerate(parts_local) if p.lower() in noms_arrel),
            None
        )
        if idx_arrel is None:
            log(f"    ✗  No s'ha trobat 'Project Files' o 'BIM_WORK' al path: {src_master.parent}", VERMELL)
            return None
        # Parts relatives: tot el que ve DESPRÉS de la carpeta arrel
        parts_relatives = parts_local[idx_arrel + 1:]
        log(f"    🗺️   Navegant a ACC: {' → '.join(parts_relatives)}", CYAN)
        return obte_folder_id_per_path(requests, token, project_id, root_folder_id, parts_relatives)
    except Exception as e:
        log(f"    ✗  Error calculant path ACC: {e}", VERMELL)
        return None


def opcio_traduir(requests, usb: Path):
    """
    [v10] Puja MASTERs del USB a ACC, registra xRefs dels vincles i dispara el processament.

    Flux per a cada _MASTER:
      1. Puja els fitxers de DISCIPLINA (_ENT, _EST, _MEP) de la mateixa carpeta
         → ACC els registra com a fitxers independents (amb item_id + version_id)
      2. Puja el _MASTER
         → ACC el registra com a fitxer host (item_id + version_id del _MASTER)
      3. POST /versions?copyFrom amb "refs" → xRefs dels fitxers de disciplina
         → ACC sap que el _MASTER depèn dels _ENT/_EST/_MEP
         → ACC inicia el processament (traducció) automàticament
         → JA NO CAL ENTRAR MANUALMENT A CADA FITXER A ACC

    Nota: els fitxers de disciplina s'han de pujar a la MATEIXA CARPETA que el _MASTER.
    """
    token = obtenir_token(requests)
    if not token:
        return

    resultat = seleccionar_projecte_acc(requests, token)
    if not resultat:
        return
    project_id, folder_id = resultat

    masters = sorted((usb / "BIM_WORK").rglob(f"*{SUFIX_MASTER}.rvt"))
    if not masters:
        log("  Cap fitxer _MASTER trobat al USB.", GROC)
        return

    separador()
    log(f"  Trobats {len(masters)} MASTERs.", NEGRETA)

    urns_per_esperar = []

    for src_master in masters:
        carpeta_master = src_master.parent
        nom_master     = src_master.name
        separador()
        log(f"  🏗️   Processant: {nom_master}", NEGRETA)

        # ── 1. Troba el folder_id de 001_MODEL-BIM a ACC per a aquest _MASTER ──
        # Cada instal·lació té la seva pròpia carpeta 001_MODEL-BIM a ACC.
        # Naveguem la jerarquia ACC seguint el path local del _MASTER.
        log(f"    🔍  Buscant carpeta 001_MODEL-BIM a ACC...", CYAN)
        folder_id_bim = obte_folder_id_model_bim(requests, token, project_id, folder_id, src_master)

        if not folder_id_bim:
            log(f"    ✗  No s'ha pogut trobar la carpeta 001_MODEL-BIM a ACC per {nom_master}", VERMELL)
            log(f"       Comprova que la carpeta existeix a ACC amb la mateixa estructura de noms.", GROC)
            folder_id_bim = folder_id  # fallback a carpeta arrel
            log(f"    ⚠️  Usant carpeta arrel com a fallback.", GROC)

        # Llegeix el contingut de la carpeta 001_MODEL-BIM específica d'aquesta instal·lació
        try:
            contingut_acc = requests.get(
                f"https://developer.api.autodesk.com/data/v1/projects/{project_id}/folders/{folder_id_bim}/contents",
                headers=caps(token), timeout=30
            ).json().get("data", [])
            items_acc = {
                x.get("attributes", {}).get("displayName", "").lower(): x["id"]
                for x in contingut_acc if x.get("type") == "items"
            }
        except Exception as e:
            log(f"    ✗  Error llegint contingut de la carpeta ACC: {e}", VERMELL)
            contingut_acc = []
            items_acc = {}

        # Identifica les disciplines de dues maneres:
        # A) Pel nom del fitxer local (Desktop Connector = mirall de ACC)
        fitxers_disc_local = [
            f for f in carpeta_master.iterdir()
            if f.suffix.lower() == ".rvt"
            and f != src_master
            and "_MASTER" not in f.name.upper()
            and any(s in f.name.upper() for s in SUFIXOS_COPIA)
        ]
        noms_disc_local = {f.name for f in fitxers_disc_local}

        # B) Directament dels fitxers .rvt que hi ha a la carpeta ACC
        #    (per si el Desktop Connector no ha descarregat totes les disciplines localment)
        noms_disc_acc = {
            x.get("attributes", {}).get("displayName", "")
            for x in contingut_acc
            if x.get("type") == "items"
            and x.get("attributes", {}).get("displayName", "").lower().endswith(".rvt")
            and "_MASTER" not in x.get("attributes", {}).get("displayName", "").upper()
            and any(s in x.get("attributes", {}).get("displayName", "").upper() for s in SUFIXOS_COPIA)
        }

        # Unió: qualsevol que aparegui per qualsevol via
        noms_disc = sorted(noms_disc_local | noms_disc_acc)
        if noms_disc_acc - noms_disc_local:
            log(f"    ℹ️  Disciplines trobades a ACC però no en local (no descarregades): "
                f"{noms_disc_acc - noms_disc_local}", GROC)

        # LOG DIAGNÒSTIC: mostra tots els fitxers que hi ha a ACC per comparar
        if items_acc:
            log(f"    📂  Fitxers trobats a la carpeta ACC ({len(items_acc)}):", CYAN)
            for nom_acc in sorted(items_acc.keys()):
                log(f"       · {nom_acc}", RESET)
        else:
            log(f"    ⚠️  La carpeta ACC sembla buida o no s'ha pogut llegir", VERMELL)

        if noms_disc:
            log(f"    📎  Disciplines identificades localment ({len(noms_disc)}):", BLAU)
            for nd in noms_disc:
                # Comparació flexible: ignora majúscules/minúscules i guions vs guions baixos
                def normalitza(s):
                    return s.lower().replace("-", "_").replace(" ", "_")
                trobat_acc = any(normalitza(nd) == normalitza(k) for k in items_acc.keys())
                estat = "✅ trobat a ACC" if trobat_acc else "⚠️ NO trobat a ACC"
                log(f"       • {nd}  [{estat}]", RESET)
        else:
            log(f"    ⚠️  No s'han trobat fitxers de disciplina a la carpeta local", GROC)
            log(f"    ℹ️  Carpeta local: {carpeta_master}", GROC)
            log(f"    ℹ️  SUFIXOS buscats: {SUFIXOS_COPIA}", GROC)
            tots_rvt = [f.name for f in carpeta_master.iterdir() if f.suffix.lower() == ".rvt"]
            log(f"    ℹ️  Tots els RVT locals: {tots_rvt}", GROC)

        # ── 2. Puja el _MASTER ────────────────────────────────────────────────
        res_master = pujar_fitxer_acc(requests, token, project_id, folder_id_bim, src_master)
        if not res_master:
            log(f"  ✗  No s'ha pogut pujar {nom_master}", VERMELL)
            continue

        master_item_id    = res_master["item_id"]
        master_version_id = res_master["version_id"]
        object_id         = res_master["object_id"]

        # ── 4. Registra xRefs + dispara processament ──────────────────────────
        separador()
        log(f"  🔗  Registrant xRefs per {nom_master}...", CYAN)
        nova_versio = registra_xrefs_master(
            requests, token, project_id, folder_id_bim,
            master_item_id, master_version_id,
            noms_disc
        )

        # ── 5. Afegeix a la llista d'espera per polling ───────────────────────
        # Usem l'URN de l'object_id del _MASTER per fer polling de la traducció
        urn = base64.urlsafe_b64encode(object_id.encode()).decode().rstrip("=")
        if nova_versio:
            # La nova versió amb xRefs és la que ACC processa — obtenim el seu URN
            nova_urn = base64.urlsafe_b64encode(nova_versio.encode()).decode().rstrip("=")
            urns_per_esperar.append((nova_urn, nom_master))
        else:
            # Fallback: traducció directa via Model Derivative si xRefs ha fallat
            log(f"  ⚠️  Fallback: llançant traducció directa via Model Derivative...", GROC)
            urn_md = traduir_master(requests, token, object_id, nom_master)
            if urn_md:
                urns_per_esperar.append((urn_md, nom_master))

    if urns_per_esperar:
        separador()
        log(f"  ⏳  Esperant processament de {len(urns_per_esperar)} MASTER(s)...", CYAN)
        log(f"  ℹ️  ACC ja ha iniciat la traducció automàticament.", GROC)
        esperar_traduccions(requests, token, urns_per_esperar)


# ──────────────────────────────────────────────
# MENÚ PRINCIPAL
# ──────────────────────────────────────────────

def menu() -> str:
    os.system("cls" if os.name == "nt" else "clear")

    print(f"{NEGRETA}{'═'*60}")
    print("  BIM SYNC USB  ·  CCB Serveis Medioambientals  v10.1")
    print(f"{'═'*60}{RESET}")
    print(f"  Origen : {ORIGEN}")
    print(f"  USB    : {USB}")
    print(f"  Log    : {LOG_PATH.name}")
    separador()
    print("  1 · Copiar disciplines  →  USB")
    print("        (_ENT / _EST / _MEP del Desktop Connector al USB)")
    separador()
    print("  2 · Pujar MASTERs       →  ACC + xRefs + Processa + Supabase")
    print("        (Puja _MASTER del USB a ACC via API,")
    print("         registra vincles de disciplines i dispara processament)")
    separador()
    print("  0 · Sortir")
    separador()

    return input("  Tria una opció: ").strip()


def main():
    # ── Comprovacions bàsiques ──
    if not ORIGEN.exists():
        log(f"No es troba la carpeta origen:\n  {ORIGEN}", VERMELL)
        log("Comprova que el Desktop Connector està connectat.", GROC)
        input("Prem ENTER per tancar...")
        sys.exit(1)

    if not USB.exists():
        log(f"No es troba el disc USB a {USB}", VERMELL)
        log("Connecta el disc USB i torna a executar l'script.", GROC)
        input("Prem ENTER per tancar...")
        sys.exit(1)

    opcio = menu()
    log(f"Opció seleccionada: {opcio}")
    separador()

    if opcio == "1":
        # Copia _ENT/_EST/_MEP del Desktop Connector al USB
        log(f"Buscant fitxers BIM a:\n  {ORIGEN}", NEGRETA)
        fitxers = trobar_fitxers_bim(ORIGEN, SUFIXOS_COPIA)
        if not fitxers:
            log("Cap fitxer _ENT / _EST / _MEP trobat.", GROC)
        else:
            log(f"Trobats {len(fitxers)} fitxers. Copiant al USB...", NEGRETA)
            separador()
            copiats = copiar_al_usb(fitxers, ORIGEN, USB)
            separador()
            log(f"Còpia finalitzada: {len(copiats)}/{len(fitxers)} fitxers.", VERD)
            log(f"Carpeta USB: {USB / 'BIM_WORK'}", VERD)

    elif opcio == "2":
        # Puja MASTERs del USB a ACC via API + xRefs + processa + publica Supabase
        separador()
        reqs = _importar_requests()
        if reqs:
            opcio_traduir(reqs, USB)

    elif opcio == "0":
        log("Sortint sense canvis.", GROC)
        sys.exit(0)

    else:
        log("Opció no vàlida. Torna a executar l'script.", VERMELL)

    # ── Desar log ──
    separador()
    desar_log(opcio)
    separador()
    input("  Prem ENTER per tancar...")


if __name__ == "__main__":
    main()
