# CBT · TaulaMaster

Plataforma web de gestió d'actius i paràmetres tècnics BIM del **Consorci Besòs Tordera**.

## Stack tecnològic

| Capa | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Routing | TanStack Router |
| UI | shadcn/ui + Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL + Auth) |
| Hosting | Vercel |

## Estructura del projecte

```
src/
├── components/
│   ├── auth/         # Login, AuthProvider, gestió d'usuaris
│   └── cbt/          # Components principals de l'app
├── hooks/            # Hooks reutilitzables (useDebounce, wrappers DataStore)
├── lib/              # Lògica de negoci (dataStore, supabase, auth, fields)
├── routes/           # Pàgines TanStack Router
└── assets/           # Imatges i recursos estàtics
api/                  # Funcions serverless (Vercel/Cloudflare)
```

## Variables d'entorn

Copia `.env.example` com a `.env.local` i omple els valors de Supabase.

## Branques

| Branca | Propòsit |
|---|---|
| `main` | Producció → deploy automàtic a Vercel |
| `develop` | Integració i proves |
| `feature/*` | Noves funcionalitats |
| `hotfix/*` | Correccions urgents |

## Comentaris i decisions tècniques

- **DataStore centralitzat**: Una sola càrrega paral·lela de les 3 taules principals (equipments, fields, gubim_class) via `Promise.all`. Elimina les 3 subscripcions independents que causaven doble re-render.
- **Lazy loading**: Els diàlegs pesats (GubimClassManager, FieldsDictionary, UserManager) es carreguen amb `React.lazy` — no bloquegen el TTI inicial.
- **Code splitting**: xlsx (~800KB) es separa en un chunk propi. Supabase i Radix també en chunks propis per maximitzar la caché del navegador.
- **TooltipProvider**: Una sola instància per tota la taula d'equips. Antes n'hi havia una per fila → centenars de mount/unmount per click.
