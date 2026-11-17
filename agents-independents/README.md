# TaulaMaster CBT — Agents

> **Ja no hi ha serveis a Render per al Visor 3D** (vegeu `docs/MIGRACIO_SENSE_RENDER.md`).
> El token APS i els enllaços públics són funcions de Vercel (`/api`), i la sincronització
> és un job de GitHub Actions. Aquesta carpeta conté el codi compartit i els agents restants.

## Estructura

```
agents-independents/
├── shared/
│   ├── ssa.ts                 ← token del bot (SSA); sense dependències, usat per Vercel i GitHub
│   ├── agent.ts               ← lògica de sincronització ACC → Supabase (executaAgent)
│   ├── bim-sync-agent.ts      ← lògica BIM Sync
│   ├── crear-masters-agent.ts ← lògica Crear Masters
│   └── helpers.ts             ← CORS, auth, body, HTML (bim-sync / crear-masters)
├── scripts/ssa-claus.mjs      ← utilitat LOCAL per llistar/crear claus del bot
├── visor3d/src/run-sync.ts    ← script de sincronització (l'executa GitHub Actions)
├── bim-sync/                  ← 🔁 BIM Sync USB (servei Node, port 3003)
└── crear-masters/             ← 🏗️  Crear MASTERs (local, port 3004)
```

## Token APS (bot taulamaster_bot)

El token es genera signant un JWT amb la clau privada del bot i intercanviant-lo per un token
d'Autodesk: sense refresh token, sense `/auth/login` i sense servei que mantenir despert.

- **Frontend** → `GET /api/aps-token` (Bearer = sessió de Supabase d'un usuari amb perfil).
- **Enllaços públics** → `POST /api/public/visor`: token d'abast `viewables:read` (només lectura).
- **Sincronització** → l'script genera el seu propi token amb el bot.
- Errors (`{ error, code }`): `UNAUTHORIZED` 401 · `FORBIDDEN` 403 · `APS_REAUTH_REQUIRED` 503
  (Autodesk rebutja el bot: revisar clau/permisos) · `APS_UPSTREAM_ERROR` 502 · `CONFIG_ERROR` 500.

## Sincronització Visor 3D

`.github/workflows/sync-monthly.yml` executa `visor3d/src/run-sync.ts` el dia 1 de cada mes (06:00 UTC)
i quan un admin prem «Executar ara» (`/api/run-sync` → `workflow_dispatch`).

Execució local (amb les variables de `visor3d/.env.example` carregades):

```bash
cd agents-independents && npm install
cd visor3d && npm run dev
```

## bim-sync i crear-masters

Cada un és un servei Node amb el seu `package.json` i variables (`.env.example`).
`crear-masters` és **només local** (requereix Revit/pyRevit). Si `bim-sync` continua a Render, vigila
el límit d'hores gratuïtes (750 h/mes compartides per workspace).

```bash
cd bim-sync && cp .env.example .env && npm install && npm run dev
cd crear-masters && cp .env.example .env && npm install && npm run dev
```

## Seguretat i CORS

Els serveis independents no habiliten CORS de manera oberta. Defineix `ALLOWED_ORIGINS`
a cada servei que rebi crides des del navegador, amb els orígens exactes separats per comes.
Per exemple:

```env
ALLOWED_ORIGINS=https://taula-master-cbt.vercel.app,http://localhost:5173
```

No incloguis una barra final als orígens. Les crides server-to-server no depenen de CORS.
Els endpoints `POST /bim-sync` i `POST /crear-masters` requereixen sempre `AGENT_SECRET`;
si el secret no està configurat, les peticions es rebutgen.
