# Migració del token APS a taulamaster_bot (Secure Service Account)

**Estat:** codi preparat; pendent de provar amb la clau real del bot (Preview/Render).

## Què canvia
- Abans: OAuth 3-legged d'un compte tècnic → refresh token d'un sol ús a Supabase (`aps_tokens`) → `/auth/login` quan caduca.
- Ara: el `token-service` signa un JWT (RS256) amb la clau privada del bot i l'intercanvia per un token 3-legged del bot. Sense refresh token, sense `/auth/login`.
- El frontend (`apsToken.ts`) i l'agent `visor3d` **no canvien**: continuen demanant el token a `/api/aps-token`.
- Mode automàtic: si hi ha `APS_SSA_ID`, `APS_SSA_KEY_ID` i `APS_SSA_PRIVATE_KEY`, s'usa el bot; si no, el mode antic. Per tornar enrere n'hi ha prou d'esborrar `APS_SSA_PRIVATE_KEY` a Render.

## Prerequisits a Autodesk (un cop)
1. El bot ha de ser membre del projecte de Forma/ACC amb permís de **lectura** a la carpeta `besso-digital` (i subcarpetes). Sense això el token serà vàlid però l'agent veurà 0 carpetes (403/404).
2. Cal llicència BIM Collaborate (lectura) per accedir als models Revit Cloud Worksharing amb un compte de servei.
3. Tenir el **Service ID** del bot, el **Key ID** i la **clau privada** (`scripts/ssa-claus.mjs`).

## Variables a Render (només `token-service`)
`APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_SSA_ID`, `APS_SSA_KEY_ID`, `APS_SSA_PRIVATE_KEY`.

## Verificació
1. `GET /health` → `"mode": "bot-ssa"` i `token_ok: true`.
2. Visor 3D carrega un model.
3. Control d'agents → Executar ara (cal el fix de `/sync` pendent) i comprovar que llista instal·lacions.

## Neteja posterior (quan tot funcioni uns dies)
Esborrar la fila de `aps_tokens` o el seu refresh token; retirar el compte tècnic antic del hub; treure `APS_CALLBACK_URL`.
