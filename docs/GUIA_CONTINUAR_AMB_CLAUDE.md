# Guia pràctica per continuar desenvolupant TaulaMaster CBT

Aquesta guia està pensada per treballar amb Claude o ChatGPT sense introduir canvis perillosos.

## Arquitectura actual

- **Frontend:** React 19 + TypeScript + Vite + TanStack Router.
- **Hosting web i API d'administració:** Vercel (`src/` i `api/`).
- **Autenticació i base de dades:** Supabase.
- **Visualització i integració BIM:** Autodesk Platform Services (APS).
- **Serveis independents:** Node/TypeScript a `agents-independents/`.
  - `token-service`: OAuth APS i renovació de tokens.
  - `visor3d`: sincronització ACC cap a Supabase.
  - `bim-sync`: còpia/sincronització BIM.
  - `crear-masters`: agent local que requereix Revit/pyRevit.

## Regles que no s'han de trencar

1. No posar mai `SUPABASE_SERVICE_ROLE_KEY`, `APS_CLIENT_SECRET`, `TOKEN_SERVICE_SECRET` o `AGENT_SECRET` en variables `VITE_*`, al frontend, ni en fitxers públics.
2. No confiar en els permisos React per protegir dades. La seguretat real ha d'estar a Supabase RLS i a les API del servidor.
3. No canviar rols ni polítiques RLS sense una migració SQL revisable i una prova amb usuaris reals de prova.
4. No modificar ni eliminar famílies `.rfa`, scripts de Revit o fitxers BIM sense confirmar-ne l'ús.
5. No fer una actualització massiva de dependències sense revisar canvis incompatibles.
6. No introduir una segona via de renovació APS: el `token-service` és l'únic servei que ha de renovar el refresh token compartit.
7. Qualsevol agent que executi accions ha de fallar de manera segura si falta el secret o la configuració.
8. Les operacions de sincronització han de ser idempotents o tenir un mecanisme de lock distribuït.

## Comandes de comprovació

Des de l'arrel del projecte:

```bash
npm ci
npm run lint
npx tsc --noEmit
npm run build
```

Per als serveis independents, entrar a la carpeta corresponent i executar les comandes definides al seu `package.json`.

## Com treballar amb Claude

Abans de demanar un canvi:
- Adjunta el repositori actualitzat, no una còpia antiga.
- Explica el resultat funcional que vols, no només la pantalla que vols modificar.
- Demana que identifiqui els fitxers afectats i les implicacions sobre permisos/dades.
- Demana una migració SQL quan canviï l'esquema de Supabase.
- Exigeix que indiqui les proves executades i les que no ha pogut executar.

Després d'un canvi:
- Revisa `git diff`.
- Executa les quatre comandes de comprovació.
- Prova el canvi en un entorn de proves abans de publicar-lo a producció.

## Variables d'entorn

Els fitxers `.env.example` són plantilles. No hi posis valors reals. Desa els secrets a Vercel/Render/GitHub Secrets segons el servei que els necessiti.

Els serveis independents que reben peticions des del navegador necessiten `ALLOWED_ORIGINS`, amb els dominis exactes separats per comes. No incloguis una barra final.
