# TaulaMaster CBT — Agents Independents

Cada agent és un servei Node.js independent amb el seu propi `package.json`, `Dockerfile` i variables d'entorn. Un error en un agent no afecta els altres.

## Estructura

```
agents-independents/
├── shared/                    ← lògica compartida (NO és un servei)
│   ├── agent.ts               ← lògica Visor 3D + obteToken3Legged
│   ├── bim-sync-agent.ts      ← lògica BIM Sync
│   ├── crear-masters-agent.ts ← lògica Crear Masters
│   └── helpers.ts             ← CORS, auth, body, HTML
│
├── token-service/             ← 🔑 Token APS (sempre actiu, port 3001)
├── visor3d/                   ← 🔄 Sync ACC→Supabase (port 3002)
├── bim-sync/                  ← 🔁 BIM Sync USB (port 3003)
└── crear-masters/             ← 🏗️  Crear MASTERs (port 3004, local)
```

## Endpoints per agent

| Agent           | Endpoints                                          |
|-----------------|----------------------------------------------------|
| token-service   | GET /health, /wake, /auth/login, /auth/callback, /api/aps-token |
| visor3d         | GET /health, /wake · POST /sync                    |
| bim-sync        | GET /health, /wake · POST /bim-sync                |
| crear-masters   | GET /health, /wake · POST /crear-masters           |

## Variables d'entorn del frontend

```env
# .env.local del projecte Vercel
VITE_TOKEN_SERVICE_URL=https://taulamaster-token.onrender.com
VITE_VISOR3D_URL=https://taulamaster-visor3d.onrender.com
VITE_BIM_SYNC_URL=https://taulamaster-bim-sync.onrender.com
VITE_CREAR_MASTERS_URL=https://taulamaster-crear-masters.onrender.com
```

> El viewer 3D ha d'apuntar a `VITE_TOKEN_SERVICE_URL` (no a `VITE_AGENT_URL`).

## Desplegament a Render

Crea **4 serveis Web** separats a Render, cadascun apuntant a la seva carpeta:

### token-service (prioritat màxima — sempre actiu)
- **Root Directory:** `token-service`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Variables d'entorn:** veure `token-service/.env.example`
- ⚠️ Activa "Always On" si tens pla pagat (evita hibernació)

### visor3d
- **Root Directory:** `visor3d`
- **Variables d'entorn:** veure `visor3d/.env.example`

### bim-sync
- **Root Directory:** `bim-sync`
- **Variables d'entorn:** veure `bim-sync/.env.example`

### crear-masters ⚠️ LOCAL ONLY
- **No desplegar a Render** — requereix Revit/pyRevit instal·lat localment
- Executar amb: `cd crear-masters && npm run dev`

## Execució local (tots els agents)

```bash
# Terminal 1 — token-service
cd token-service && cp .env.example .env && npm install && npm run dev

# Terminal 2 — visor3d
cd visor3d && cp .env.example .env && npm install && npm run dev

# Terminal 3 — bim-sync
cd bim-sync && cp .env.example .env && npm install && npm run dev

# Terminal 4 — crear-masters (requereix Revit)
cd crear-masters && cp .env.example .env && npm install && npm run dev
```

## Autenticació OAuth APS

L'OAuth 3-legged **només cal fer-lo una vegada** i ara és responsabilitat exclusiva del `token-service`:

1. Obre `https://taulamaster-token.onrender.com/auth/login`
2. Autoritza a Autodesk
3. El token es desa a Supabase i es renova automàticament cada 50 min

## Migració des de l'agent monolític

El `server.ts` original (monolític) **es pot conservar** mentre no hi ha problemes. La migració recomanada:

1. Desplega primer el `token-service` i actualitza `VITE_AGENT_URL` → `VITE_TOKEN_SERVICE_URL` al frontend
2. Desplega `visor3d` i elimina el `/sync` de l'agent monolític
3. Desplega `bim-sync` i `crear-masters` quan convingui
4. Elimina l'agent monolític quan tots els serveis funcionin
