# Auditoria tècnica de TaulaMaster CBT

Data de revisió: 6 de novembre de 2026  
Abast: codi font i configuració inclosos a `TaulaMasterCBT-main(1).zip`.

## Resum executiu

La plataforma té una base funcional raonable: React + TypeScript + Vite al frontend, Supabase per autenticació i dades, Vercel per publicar la web i serveis Node independents per a Autodesk Platform Services (APS), sincronització i operacions BIM.

La separació dels agents i l'ús de Supabase Auth són decisions adequades. Tanmateix, el projecte encara té riscos que no s'han de confondre amb errors visuals: hi havia una fallada en el model de permisos, dos agents podien quedar oberts si faltava el secret, el codi HTML de la pantalla OAuth no escapava contingut dinàmic i el callback d'autenticació feia operacions Supabase asíncrones dins del callback d'`onAuthStateChange`.

S'han aplicat correccions al codi i s'han afegit instruccions de desplegament. No s'ha eliminat cap funcionalitat ni cap família Revit perquè no hi ha evidència suficient que siguin prescindibles.

## Canvis aplicats

### P0 — Seguretat i control d'accés

1. **Permisos nuls interpretats com a accés complet**
   - Abans: un perfil `user` amb `allowed_views = null` podia obtenir accés complet segons les funcions de permisos.
   - Ara: només `role = admin` té accés complet. Un perfil `user` sense permisos explícits queda sense accés a les seccions.
   - També s'ha corregit la matriu d'usuaris perquè un permís absent no es mostri ni s'editi com a accés complet.
   - Acció pendent: revisar els perfils existents a Supabase abans de desplegar. Els usuaris normals amb `allowed_views = null` quedaran bloquejats fins que un administrador els assigni permisos explícits.

2. **Autenticació fail-open dels agents**
   - Abans: `verificaAuth()` retornava `true` quan `AGENT_SECRET` no estava configurat.
   - Ara: un secret absent o buit rebutja sempre la petició. La comparació del secret es fa en temps constant.
   - Efecte: configurar `AGENT_SECRET` és obligatori per a `bim-sync` i `crear-masters`.

3. **CORS dels agents**
   - Abans: tots els orígens web (`*`) estaven autoritzats.
   - Ara: només es retorna `Access-Control-Allow-Origin` per als orígens inclosos a `ALLOWED_ORIGINS` (o `APP_URL` com a alternativa).
   - Acció pendent: configurar `ALLOWED_ORIGINS` a Render/entorn local amb el domini real de la plataforma i localhost només per a desenvolupament.

4. **HTML de resposta OAuth**
   - Abans: el títol i el missatge dinàmics s'inserien directament a HTML.
   - Ara: s'escapen els caràcters HTML abans de renderitzar-los, evitant injecció de codi en aquesta pàgina.

5. **Estat OAuth APS**
   - Abans: el paràmetre `state` es generava amb `Math.random()`.
   - Ara: es genera amb `crypto.randomBytes(32)`.

### P1 — Estabilitat i qualitat

6. **Callback de Supabase Auth**
   - Les operacions asíncrones que consulten Supabase s'executen ara fora del callback síncron d'`onAuthStateChange`, mitjançant una tasca diferida. Això evita el patró que pot provocar bloquejos interns del client Supabase.

7. **Headers de `supaFetch`**
   - S'ha eliminat l'intent de fixar `Accept-Encoding` des del navegador (header controlat pel navegador).
   - Els headers opcionals ja no poden substituir les credencials d'autenticació de la petició.

8. **Integració contínua**
   - S'ha eliminat `continue-on-error: true` del pas de lint. Abans, la CI podia continuar encara que ESLint detectés errors.

9. **Configuració**
   - S'han afegit exemples d'entorn per als agents `bim-sync` i `crear-masters`.
   - S'ha documentat la variable `ALLOWED_ORIGINS`.

## Riscos pendents que no es poden resoldre només amb aquest ZIP

### P0 — Verificar Supabase RLS i polítiques de base de dades

El ZIP no inclou migracions SQL, definició de taules ni polítiques RLS. Per tant, no es pot confirmar que les dades estiguin protegides al servidor.

Cal revisar, com a mínim:
- `user_profiles`: un usuari no pot canviar el seu propi `role`, `allowed_views` ni `organisation`.
- Taules d'equips, camps, projectes, TAGs i logs: permisos de lectura/escriptura per rol i secció.
- `aps_tokens`: cap usuari del navegador pot llegir ni modificar access/refresh tokens.
- Les polítiques RLS han d'aplicar-se a cada taula; amagar botons o pàgines al React no és seguretat.
- Les operacions amb `SUPABASE_SERVICE_ROLE_KEY` només poden executar-se al servidor.

**No desplegar assumint que la UI és suficient per protegir les dades.**

### P0 — Revisar l'inici del flux OAuth APS

`GET /auth/login` inicia un flux OAuth global i no exigeix autenticació d'administrador abans de començar-lo. El callback desa el token APS compartit a Supabase. Cal valorar restringir l'inici a administradors i vincular l'intent OAuth a una sessió administrativa, sense exposar cap secret al navegador.

Aquesta restricció no s'ha implementat perquè el flux actual documentat és una navegació directa a l'URL i cal adaptar també el mecanisme d'inici de sessió i el callback.

### P1 — Límits i validació de peticions als agents

Els agents llegeixen el body HTTP en memòria. Cal afegir un límit de mida (per exemple, 1 MB), validar `Content-Type`, validar l'estructura JSON i gestionar explícitament els errors de body massa gran o mal format.

### P1 — Protecció contra execucions duplicades entre instàncies

Els flags `agentEnExecucio` només protegeixen una instància del procés. Si Render aixeca dues instàncies o hi ha reinicis, poden iniciar-se dues sincronitzacions simultànies. La protecció definitiva ha de ser un lock distribuït a Supabase o una cua de treball amb idempotència.

### P1 — Llistat d'usuaris

`api/list-users.ts` pot recórrer totes les pàgines d'usuaris d'Auth per recuperar correus que falten. En instal·lacions grans això és costós. Cal corregir el trigger que crea `user_profiles.email` i evitar haver de reconstruir-lo consultant tot Auth.

### P1 — Dependències i cadena de subministrament

`xlsx` està fixat a una versió antiga (`0.18.5`). Cal revisar l'estat de seguretat i compatibilitat de la llibreria abans d'actualitzar-la o substituir-la. No s'ha fet una actualització automàtica perquè pot afectar la importació/exportació Excel.

### P1 — Còpies de seguretat i recuperació

No hi ha evidència al ZIP de la política de còpies, retenció, restauració ni prova periòdica de recuperació de Supabase. Definir RPO/RTO, exportacions i prova de restauració.

## Limitacions de la revisió

- No s'ha proporcionat l'esquema SQL ni les polítiques RLS de Supabase.
- No s'han proporcionat variables d'entorn reals (correctament: no s'han d'incloure al ZIP).
- No s'ha pogut completar `npm ci` en aquest entorn: la instal·lació ha superat el límit de temps. Per tant, no s'ha pogut executar ESLint, TypeScript ni el build.
- No s'ha connectat amb Vercel, Supabase, Autodesk ni Render; no s'han fet canvis en serveis desplegats.
- Les famílies `.rfa` i altres fitxers BIM s'han preservat sense modificacions.

## Verificació obligatòria abans de desplegar

1. Revisar `allowed_views` dels usuaris existents i assignar permisos explícits als usuaris normals.
2. Configurar `AGENT_SECRET` a `bim-sync` i `crear-masters`.
3. Configurar `ALLOWED_ORIGINS` a tots els serveis independents amb el domini real de Vercel.
4. Confirmar que `SUPABASE_SERVICE_ROLE_KEY`, `APS_CLIENT_SECRET` i `TOKEN_SERVICE_SECRET` només existeixen als entorns servidor.
5. Revisar les polítiques RLS de totes les taules.
6. Executar `npm ci`, `npm run lint`, `npx tsc --noEmit` i `npm run build`.
7. Provar login, logout, recuperació de contrasenya, invitacions i permisos amb comptes de prova d'admin, editor, viewer i sense accés.
8. Provar els agents sense secret (han de respondre 401), amb secret incorrecte (401) i amb secret correcte (202).
9. Provar la renovació APS i verificar que el token no és accessible des de consultes directes del navegador a `aps_tokens`.
