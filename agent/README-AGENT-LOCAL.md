# Agent TaulaMaster CBT — Execució Local

## Per què cal executar l'agent localment?

L'opció **Pujar MASTERs** de l'Agent BIM Sync necessita accés físic al disc USB
on tens els fitxers `.rvt`. Un servidor cloud (Render, etc.) no pot accedir
al teu USB, per la qual cosa l'agent ha de córrer a **l'ordinador** on tens
el USB connectat.

---

## Configuració ràpida

### 1. Configura les variables d'entorn

```bash
cd agent
cp .env.example .env
# Edita .env amb el teu editor preferit
```

Les variables clau:

| Variable | Descripció | Exemple |
|---|---|---|
| `BIM_USB_PATH` | Ruta a la carpeta `BIM_WORK` del USB | `F:\BIM_WORK` |
| `AGENT_SECRET` | Ha de coincidir amb `VITE_AGENT_SECRET` de la web | `el_teu_secret` |
| `APS_CLIENT_ID` | Client ID de la teva app APS | `abc123...` |
| `APS_CLIENT_SECRET` | Client Secret de la teva app APS | `xyz789...` |
| `SUPABASE_URL` | URL del teu projecte Supabase | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clau de servei de Supabase | `eyJ...` |

### 2. Instal·la les dependències

```bash
cd agent
npm install
```

### 3. Arranca l'agent

```bash
npm run dev
# o en producció:
npm start
```

L'agent arranca al port `3000` per defecte.

### 4. Connecta la web a l'agent local

A la web (`.env.local` o Vercel → Environment Variables):

```
VITE_AGENT_URL=http://localhost:3000
VITE_AGENT_SECRET=el_teu_secret   # ha de coincidir amb AGENT_SECRET
```

Si la web és a Vercel i l'agent és local, necessites exposar el port
amb una eina com [ngrok](https://ngrok.com):

```bash
ngrok http 3000
# Copia la URL https://xxxx.ngrok.io i posa-la a VITE_AGENT_URL
```

---

## Error "El directori USB no existeix"

Aquest error apareix quan:

1. **`BIM_USB_PATH` no està definida** → Afegeix-la al `.env` de l'agent.
2. **La lletra del USB ha canviat** → El Windows pot assignar una lletra diferent
   cada vegada. Comprova la lletra actual a l'Explorador de fitxers i actualitza
   `BIM_USB_PATH` al `.env`.
3. **L'agent corre a cloud** → Render/cloud no té accés al teu USB.
   L'agent **ha de córrer localment**.
4. **El USB no està connectat** → Connecta'l i torna a intentar-ho.

---

## On busca l'script l'agent "Crear Masters"?

L'agent `crear-masters` busca l'script en dos llocs, per ordre:

1. **Variable d'entorn `PYREVIT_SCRIPT_PATH`**: si la defineixes al `.env`,
   l'agent executarà l'script Python directament via subprocess (requereix
   Python i pyRevit instal·lats).

2. **Mode manual (sense `PYREVIT_SCRIPT_PATH`)**: l'agent retorna un pla
   d'execució (llista d'instal·lacions detectades) però **no crea els MASTERs**.
   En aquest cas, has d'executar l'script manualment des de Revit via pyRevit.

L'script es troba a:
```
public/scripts/script.py
```

I la ruta d'instal·lació a pyRevit és:
```
%APPDATA%\pyRevit-Master\Extensions\CBT.extension\CBT.tab\CBT Tools.panel\Crear Masters.pushbutton\script.py
```

Pots descarregar-lo des de la web: **Control d'Agents → Crear Masters → Descarregar script.py**.
