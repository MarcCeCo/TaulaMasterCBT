# Migració: fora de Render (opció C)

**Estat:** implementat a la branca de prova; pendent de configurar les variables i provar en un desplegament Preview.

## Què ha canviat

| Abans (Render)                                          | Ara                                                                                   |
|---------------------------------------------------------|---------------------------------------------------------------------------------------|
| `token-service` → `GET /api/aps-token`                  | Funció de Vercel `api/aps-token.ts` (genera el token amb el bot SSA)                  |
| `token-service` → enllaços públics (`/api/public/visor`, `/api/public-links`, `/api/public-links/revoke`) | Funcions de Vercel `api/public/visor.ts`, `api/public-links/index.ts`, `api/public-links/revoke.ts` (**mateixes rutes**) |
| `visor3d` (servei) → `POST /sync`                       | Script `agents-independents/visor3d/src/run-sync.ts` executat per GitHub Actions      |
| Botó «Executar ara» → `POST {VITE_VISOR3D_URL}/sync`    | Botó → `POST /api/run-sync` (Vercel, només admins) → `workflow_dispatch` de GitHub    |
| `keep-agent-alive.yml` + UptimeRobot                    | **Eliminats** (no hi ha cap servei que mantenir despert)                              |

La lògica del bot (JWT RS256 → token d'Autodesk) viu a `agents-independents/shared/ssa.ts` i la comparteixen Vercel i GitHub Actions.

**Efecte per a l'usuari:** el visor ja no espera ~50 s a despertar un servei. El token surt d'una funció serverless (fraccions de segon) i es guarda en memòria del navegador; els enllaços públics igual.

**Eliminat del repo:** `agents-independents/token-service/` (el `ssa-claus.mjs` s'ha mogut a `agents-independents/scripts/`) i `visor3d/src/server.ts` + `Dockerfile`. `bim-sync` i `crear-masters` no s'han tocat.

## Variables a configurar

### Vercel (Settings → Environment Variables; només servidor, **sense** prefix `VITE_`)

| Variable | Valor |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ja hi és (usada per `create-user`, etc.) |
| `APS_CLIENT_ID`, `APS_CLIENT_SECRET` | els de l'app Server-to-Server (abans a Render) |
| `APS_SSA_ID`, `APS_SSA_KEY_ID`, `APS_SSA_PRIVATE_KEY` | els del bot `taulamaster_bot` (abans a Render) |
| `GITHUB_DISPATCH_TOKEN` | **nou**: fine-grained PAT amb accés **només** a aquest repo i permís *Actions: Read and write* |
| `GITHUB_REPO` | opcional (`propietari/repo`); si Vercel està connectat a Git es dedueix |
| `GITHUB_REF` | opcional; per defecte la branca del desplegament (a la preview de `test` serà `test`) |

Variables `VITE_*` que **ja no calen** i es poden esborrar: `VITE_TOKEN_SERVICE_URL`, `VITE_VISOR3D_URL`, `VITE_AGENT_URL`.

### GitHub (Settings → Secrets and variables → Actions → Secrets)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_SSA_ID`, `APS_SSA_KEY_ID`, `APS_SSA_PRIVATE_KEY`, `APS_HUB_ID`, `APS_PROJECT_ID`.
Ja no calen `AGENT_URL`, `AGENT_SECRET` ni `TOKEN_SERVICE_URL`.

## Com provar-ho a la branca `test`

1. Configura les variables de Vercel (entorn *Preview*) i els secrets de GitHub.
2. Obre el visor 3D a la URL de la preview: ha de carregar un model sense espera.
3. Crea un enllaç públic i obre'l en una finestra d'incògnit.
4. A Control d'Agents prem «Executar ara»: a GitHub → Actions ha d'aparèixer «Sincronització Visor 3D» i, en acabar, un nou registre a `visor3d_sync_log`.
   El workflow ha d'existir a la branca on es dispara (per això el `ref` és la branca del desplegament).

## A tenir en compte

- **Límit de peticions dels enllaços públics:** ara és en memòria *per instància* serverless: frena abusos simples però no és un límit global estricte. Si cal, es pot moure a una taula de Supabase.
- **Cron de GitHub:** GitHub desactiva els workflows programats d'un repositori sense activitat durant 60 dies. Si un mes no s'executa, reactiva'l a Actions.
- **Pla Hobby de Vercel:** no admet ús comercial; si la plataforma és d'una empresa, revisa'n els termes.
- **Retirada de Render:** un cop provat, elimina els serveis `token-service` i `visor3d` a Render i els monitors d'UptimeRobot.
- **Rotació de claus:** la clau privada del bot ara és en dos llocs (Vercel i GitHub). Si la rotes (`scripts/ssa-claus.mjs`), actualitza'ls tots dos.
