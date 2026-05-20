# CBT · TaulaMaster — Guia de Desenvolupament

> Document de referència per afegir funcionalitats, pàgines o modificar qualsevol part de la plataforma mantenint la coherència tècnica i visual del projecte.

---

## 1. Stack i versions

| Capa | Tecnologia | Versió |
|---|---|---|
| UI framework | React | 19 |
| Llenguatge | TypeScript | 5.8 |
| Build | Vite | 7 |
| Routing | TanStack Router | 1.168 |
| Estils | Tailwind CSS v4 + shadcn/ui | 4.2 |
| Backend | Supabase (PostgreSQL + Auth) | 2.49 |
| Hosting | Vercel | — |
| Runtime dev | Bun | — |

---

## 2. Estructura de carpetes

```
src/
├── components/
│   ├── auth/          # Login, AuthProvider, gestió d'usuaris, canvi de contrasenya
│   └── cbt/           # Totes les pàgines i components principals de l'app
│       ├── AppSidebar.tsx          # Navegació lateral (grups + items)
│       ├── TaulaMasterMain.tsx     # Shell principal: lazy-load de pàgines
│       ├── DashboardHome.tsx       # Pàgina d'inici amb estadístiques
│       └── [NomPàgina]Page.tsx     # Convenció per a pàgines
├── hooks/             # Hooks reutilitzables
│   ├── useAuthLoad.ts      # Patró auth/load/visibility compartit
│   ├── useDebounce.ts      # Debounce genèric
│   ├── useEquipments.ts    # Tipus Equipment (wrapper lleuger)
│   ├── useGubimClass.ts    # Tipus GubimNode + helpers de codi
│   └── useVisor3DSistemes.ts
├── lib/               # Lògica de negoci i accés a dades
│   ├── dataStore.tsx       # Context central: equipments + fields + gubim_class
│   ├── useProjectes.tsx    # Context de projectes i tags
│   ├── auth.ts             # Tipus, rols i helpers d'autenticació
│   ├── supabase.ts         # Client Supabase (auth i realtime)
│   ├── supaFetch.ts        # fetch directe a REST API (amb deduplicació GET)
│   ├── exportRosmiman.ts   # Exportació xlsx per a Rosmiman
│   ├── fields.ts           # Tipus FieldMeta + helpers de classificació
│   ├── storage.ts          # localStorage debounced + uid()
│   └── utils.ts            # cn() (clsx + tailwind-merge)
├── routes/            # Pàgines TanStack Router
│   ├── __root.tsx          # Layout arrel (AuthProvider ja és a main.tsx)
│   ├── index.tsx           # Ruta / → redirigeix a login o app
│   └── auth/callback.tsx   # Callback OAuth / PKCE
├── assets/            # Imatges estàtiques (logo, favicon original)
└── styles.css         # Variables CSS, Tailwind, animacions globals

api/                   # Funcions serverless Vercel/Cloudflare Workers
public/                # Assets públics (favicon.png, docs, families Revit)
agent/                 # Microservei Node.js per APS (Autodesk Platform Services)
```

---

## 3. Identitat visual i paleta de colors

### Paleta CBT (variables CSS definides a `styles.css`)

```css
/* Primaris — teal corporatiu */
--cbt-950: #001F23   /* sidebar fons fosc */
--cbt-900: #003D44   /* N1 badges, elements de marca */
--cbt-800: #005A63
--cbt-700: #007380   /* N2 badges */
--cbt-600: #008A98
--cbt-500: #0099A8   /* color primari de botons/accions */
--cbt-400: #1AAFC0   /* N3 badges, accents hover */
--cbt-300: #4DC9D8   /* accent lluminós, sidebar actiu */
--cbt-200: #8DD9E3
--cbt-100: #C8EFF4
--cbt-50:  #EAF8FA   /* fons subtil */

/* Neutres càlids (arena) */
--sand-50:  #F8F9F7  /* fons de pàgina principal */
--sand-100: #F3F4F2
--sand-200: #E8EAE7
--sand-300: #D8DDD8
--sand-400: #C5CCC5
```

### Tipografia

| Ús | Família | Variant |
|---|---|---|
| Text general | Plus Jakarta Sans | 300–800, italic 400 |
| Codis, IDs, valors tècnics | JetBrains Mono | 400, 500 |

**Regles:**
- Mai usar `font-sans` (Inter per defecte de Tailwind) — el tema ja sobreescriu `--font-sans` amb Plus Jakarta Sans.
- Tots els codis GuBIMClass, equip codes, IDs → `font-mono text-xs`.
- Títols de pàgina → `text-[15px] font-bold` o `text-base font-semibold`.

### Classes globals reutilitzables

```css
.cbt-gradient          /* gradient de marca per fons */
.cbt-sidebar-bg        /* gradient del sidebar */
.cbt-sidebar-active-bar /* barra lateral verda per ítem actiu */
.cbt-stat-card         /* card d'estadística amb hover translateY */
.cbt-topbar            /* topbar glassmorphism */
.cbt-login-bg          /* fons de la pàgina de login */
.animate-fade-in-up    /* animació d'entrada (combinar amb .stagger-1..6) */
.cbt-pulse             /* pulsació suau per indicadors d'estat */
```

### Colors semàntics per badges

| Context | Classe Tailwind |
|---|---|
| Positiu / Sí / Validat | `bg-emerald-100 text-emerald-700` |
| Pendent / Neutre | `bg-amber-100 text-amber-700` |
| Negatiu / Rebutjat | `bg-red-100 text-red-700` |
| Informatiu / Comptador | `bg-slate-100 text-slate-500` |
| Primari CBT | `bg-[#0099A8] text-white` |
| Advertència orfes | `bg-amber-100 text-amber-700` |

---

## 4. Com afegir una pàgina nova

### Pas 1 — Crear el component de pàgina

Crea `src/components/cbt/NomPàginaPage.tsx`. Estructura mínima:

```tsx
// src/components/cbt/NomPàginaPage.tsx
import { useMemo, useState } from "react";
import { useDataStore } from "@/lib/dataStore";   // si necessites dades centrals
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function NomPàginaPage() {
  const { loading, error, retry } = useDataStore();
  const { canEditView } = useAuth();
  const canEdit = canEditView("equips"); // canvia pel view corresponent

  // Loading skeleton
  if (loading) return <PageSkeleton />;

  // Error state
  if (error) return (
    <div className="flex flex-col items-center gap-3 p-12 text-center">
      <p className="text-sm text-muted-foreground">{error}</p>
      <Button variant="outline" size="sm" onClick={retry}>Torna-ho a provar</Button>
    </div>
  );

  return (
    <div className="p-6 space-y-5 animate-fade-in-up">
      {/* Capçalera de pàgina */}
      <div>
        <h1 className="text-[15px] font-bold text-slate-800">Nom de la Pàgina</h1>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">Descripció breu</p>
      </div>

      {/* Contingut */}
    </div>
  );
}

function PageSkeleton() {
  // Esquelet de càrrega: veure DashboardHome.tsx per exemple complet
  return <div className="p-6 animate-pulse">...</div>;
}
```

### Pas 2 — Registrar la pàgina al TaulaMasterMain

A `src/components/cbt/TaulaMasterMain.tsx`, afegeix el lazy import i el cas al switch:

```tsx
// Afegir lazy import
const NomPàginaPage = lazy(() =>
  import("./NomPàginaPage").then((m) => ({ default: m.NomPàginaPage }))
);

// Afegir al switch d'`activeSection`
case "nom-pagina":
  content = <NomPàginaPage />;
  break;
```

### Pas 3 — Afegir al sidebar

A `src/components/cbt/AppSidebar.tsx`, afegeix l'ítem al grup corresponent:

```tsx
{
  id: "nom-pagina",
  label: "Nom de la Pàgina",
  icon: <IconaLucide className="h-[15px] w-[15px]" />,
  section: "nom-pagina",
  view: "nom_view",  // ha de coincidir amb AppView de auth.ts
}
```

### Pas 4 — Registrar el view a `auth.ts` (si és una secció nova amb permisos)

```ts
// src/lib/auth.ts
export type AppView =
  | "equips" | "gubimclass" | "fields" | "revit"
  | "projectes" | "rosmiman" | "visor3d"
  | "nom_view";  // ← afegir aquí

export const VIEW_LABELS: Record<AppView, string> = {
  // ...
  nom_view: "Nom de la Vista",
};

export const VIEW_ICONS: Record<AppView, string> = {
  // ...
  nom_view: "🔧",
};
```

---

## 5. Com afegir dades noves de Supabase

### Opció A — Les dades s'usen a totes les pàgines → afegir al DataStore

Afegeix la càrrega a `Promise.all` de `src/lib/dataStore.tsx` i exposa l'estat via context:

```tsx
// Dins del load() callback de DataStoreProvider:
const [equipData, fieldsData, nouData] = await Promise.all([
  supa(token, "GET", "equipments?select=*&order=equip_code.asc"),
  supa(token, "GET", "fields?select=*"),
  supa(token, "GET", "nova_taula?select=*&order=created_at.desc"),
]);

// Afegir estat i exposar via DataStoreValue
```

### Opció B — Les dades són específiques d'una pàgina → hook propi

Usa el patró establert amb `useAuthLoad`:

```ts
// src/hooks/useNovaTaula.ts
import { useState, useEffect, useCallback, startTransition } from "react";
import { useAuthLoad } from "@/hooks/useAuthLoad";
import { supaFetch as supa } from "@/lib/supaFetch";

export function useNovaTaula() {
  const { getFreshToken, shouldLoad, loadingRef, setupAuthListeners } = useAuthLoad();
  const [items, setItems] = useState<NouTipus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const token = await getFreshToken();
    if (!token) {
      setError("Sessió no disponible. Torneu a iniciar sessió.");
      setLoading(false);
      loadingRef.current = false;
      return;
    }

    try {
      const rows = await supa(token, "GET", "nova_taula?select=*&order=created_at.desc");
      startTransition(() => setItems(rows.map(toNouTipus)));
    } catch (e: any) {
      setError(e?.message ?? "Error de xarxa");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [getFreshToken, loadingRef]);

  useEffect(() => { if (shouldLoad) load(); }, [shouldLoad, load]);

  useEffect(() => setupAuthListeners({
    onLoad: load,
    onSignOut: () => { startTransition(() => setItems([])); setLoading(false); setError(null); },
  }), [load, setupAuthListeners]);

  // CRUD...
  return { items, loading, error, retry: load };
}
```

**Regles obligatòries per a nous hooks de dades:**
- Sempre usar `useAuthLoad` (mai duplicar el patró manualment).
- Sempre `startTransition()` per actualitzacions d'estat de càrrega.
- `loadingRef.current` per evitar peticions paral·leles.
- Operacions de mutació: optimistic update local → confirma a Supabase.
- Batches a Supabase: màx. 50 files per POST (equipments: 25 per payload gran).

---

## 6. Accés a dades i autenticació

### Lectures (GET)

**Sempre** usar `supaFetch` de `@/lib/supaFetch` (no el client de Supabase directament). Inclou deduplicació automàtica de GETs idèntics en vol:

```ts
import { supaFetch as supa } from "@/lib/supaFetch";

const rows = await supa(token, "GET", "taula?select=*&order=camp.asc");
```

### Escriptures (POST / PATCH / DELETE)

```ts
// INSERT o UPSERT
await supa(token, "POST", "taula?on_conflict=id", payload, {
  "Prefer": "return=minimal,resolution=merge-duplicates",
});

// UPDATE parcial
await supa(token, "PATCH", `taula?id=eq.${id}`, patch, {
  "Prefer": "return=minimal",
});

// DELETE
await supa(token, "DELETE", `taula?id=eq.${id}`);
```

### Obtenir token

```ts
// Dins d'un hook que usa useAuthLoad:
const token = await getFreshToken();

// Dins d'un callback de mutació (token síncron, no espera):
const { getToken } = useAuth();
const token = getToken();  // pot ser "" si la sessió ha caducat
```

### Rols i permisos

```ts
const { isAdmin, canSeeView, canEditView, canEditSection } = useAuth();

// Comprovar si l'usuari pot veure una secció
if (!canSeeView("equips")) return <AccessDenied />;

// Botons d'edició condicionats
{canEditView("equips") && <Button>Editar</Button>}
```

**Views disponibles:** `equips` · `gubimclass` · `fields` · `revit` · `projectes` · `rosmiman` · `visor3d`

---

## 7. Components UI i patrons visuals

### Usa sempre shadcn/ui per als components base

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, ... } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
```

### Botons

```tsx
// Acció principal (crear, guardar)
<Button className="bg-[#0099A8] hover:bg-[#007380] text-white">Guardar</Button>

// Acció destructiva
<Button variant="destructive">Eliminar</Button>

// Acció secundària
<Button variant="outline">Cancel·la</Button>

// Icona
<Button size="icon" variant="ghost" className="h-7 w-7">
  <Pencil className="h-3.5 w-3.5" />
</Button>
```

### Diàlegs

Tots els diàlegs pesats han d'estar en fitxers separats i carregats lazy des de `TaulaMasterMain.tsx`. Els diàlegs lleugers (confirmació, formulari simple) poden estar inline al component.

```tsx
// Diàleg de confirmació destructiva → sempre AlertDialog
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600">
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Esborrar {nom}?</AlertDialogTitle>
      <AlertDialogDescription>Aquesta acció no es pot desfer.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel·la</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Esborra</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Taules de dades

```tsx
// TooltipProvider FORA del map de files (una sola instància per taula)
<TooltipProvider delayDuration={300}>
  <table>
    <thead>
      <tr className="border-b border-slate-200 bg-slate-50/80">
        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Columna
        </th>
      </tr>
    </thead>
    <tbody>
      {items.map((item) => (
        <tr
          key={item.id}
          className="border-t border-slate-100 hover:bg-slate-50/70 cursor-pointer transition-colors"
          onClick={() => onView(item)}
        >
          <td className="px-3 py-2 text-[13px] text-slate-700">{item.nom}</td>
        </tr>
      ))}
    </tbody>
  </table>
</TooltipProvider>
```

### Missatges toast

```ts
toast.success("Operació completada");
toast.error("Error: " + message);
toast.info("Informació");
toast.loading("Carregant...");  // retorna id per a toast.dismiss(id)
```

### Icones

Usar exclusivament `lucide-react`. Mides estandarditzades:
- Icones en botons d'acció de taula: `h-3.5 w-3.5`
- Icones en botons normals: `h-4 w-4`
- Icones decoratives en cards: `h-5 w-5` o `h-6 w-6`
- Icones en sidebar: `h-[15px] w-[15px]`

---

## 8. Gestió de rendiment

### Regla d'or: mai importar xlsx estàticament

```ts
// ✅ Correcte — lazy load quan l'usuari ho demana
const handleExport = async () => {
  const XLSX = await import("xlsx");
  // ...
};

// ❌ Incorrecte — afegeix ~750 KB al chunk inicial
import * as XLSX from "xlsx";
```

### Memoization

```tsx
// useMemo per càlculs derivats costosos
const filtered = useMemo(() =>
  items.filter(/* ... */),
  [items, query]
);

// useCallback per funcions passades com a props
const handleDelete = useCallback(async (id: string) => {
  await removeItem(id);
  toast.success("Eliminat");
}, [removeItem]);

// memo() per components fila de taula (evita re-renders en cascada)
const RowComponent = memo(function RowComponent({ item, onEdit }: Props) {
  return <tr>...</tr>;
});
```

### Debounce per cerca

```tsx
import { useDebounce } from "@/hooks/useDebounce";

const [q, setQ] = useState("");
const debouncedQ = useDebounce(q, 200);

const filtered = useMemo(() =>
  debouncedQ ? items.filter(i => i.nom.toLowerCase().includes(debouncedQ.toLowerCase())) : items,
  [items, debouncedQ]
);
```

### Chunks i code splitting

El `vite.config.ts` ja gestiona els chunks automàticament. Per a components pesats nous, usar lazy:

```tsx
const NouComponentPesant = lazy(() =>
  import("./NouComponentPesant").then((m) => ({ default: m.NouComponentPesant }))
);
```

---

## 9. Convenions de codi

### Nomenclatura

| Element | Convenció | Exemple |
|---|---|---|
| Components React | PascalCase | `EquipmentFormDialog` |
| Hooks | camelCase amb `use` | `useVisor3DSistemes` |
| Funcions utilitàries | camelCase | `buildTag`, `sortByClassification` |
| Constants | UPPER_SNAKE o camelCase | `REVIT_CATEGORIES_FLAT`, `PAGE` |
| Fitxers de component | PascalCase | `EquipmentsTable.tsx` |
| Fitxers de hook/lib | camelCase | `useAuthLoad.ts`, `supaFetch.ts` |
| Columnes Supabase → camp TS | snake_case → camelCase | `equip_code` → `equipCode` |

### Tipus i conversors

Cada taula de Supabase té un parell de funcions de conversió:

```ts
// fila Supabase → tipus TS
const toEquip = (row: any): Equipment => ({ ... });

// tipus TS → fila Supabase
const equipToRow = (e: Equipment) => ({ ... });
```

Definir **sempre** el tipus TS explícit. Evitar `any` fora dels conversors.

### Comentaris

- Bloc de comentari al principi de cada fitxer explicant el propòsit i decisions no òbvies.
- Comentaris de secció amb el patró `// ─── Títol ─────`.
- Comentaris `// PERF:` per a decisions de rendiment.
- No comentar l'obvi (`// incrementa el comptador`).

### Idioma del codi

- Noms de variables, funcions i tipus: **anglès** (o català si és terminologia de domini: `gubimCode`, `codiInstallacio`).
- Comentaris i missatges a l'usuari: **català**.
- Errors tècnics de consola: anglès.

---

## 10. Formularis i validació

Usar `react-hook-form` + `zod` per a formularis amb validació complexa. Formularis simples (1–3 camps) poden usar `useState` directe.

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  nom: z.string().min(1, "El nom és obligatori"),
  codi: z.string().regex(/^\d{4}-\d{1,4}$/, "Format NNNN-N"),
});

const form = useForm({ resolver: zodResolver(schema) });
```

Missatges d'error: en català, descriptius, amb el format correcte si cal.

---

## 11. Seguretat i accés

- **Mai** posar lògica de control d'accés al backend del frontend. Supabase RLS (Row Level Security) protegeix les dades.
- **Sempre** comprovar `canSeeView` / `canEditView` al frontend per mostrar/ocultar elements.
- **Mai** emmagatzemar tokens a `localStorage` directament — Supabase gestiona la sessió a través de `storageKey: "cbt-taula-master-auth"`.
- Variables d'entorn sensibles: **mai** al codi client excepte les que comencen per `VITE_` (que Vite incorpora al bundle).

### Variables d'entorn necessàries

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_AGENT_URL=https://agent.example.com   # opcional, per APS/Autodesk
```

---

## 12. Deploy i branques

| Branca | Propòsit | Deploy |
|---|---|---|
| `main` | Producció | Automàtic a Vercel |
| `develop` | Integració i proves | Manual / Preview |
| `feature/nom` | Nova funcionalitat | Preview URL |
| `hotfix/nom` | Correcció urgent | → `main` directe |

### Checklist abans de fer PR

- [ ] No hi ha `console.log` deixats (excepte errors reals amb `console.error`).
- [ ] Tots els components nous amb lazy load si pesan > ~50 KB.
- [ ] Cap import estàtic de `xlsx` — sempre lazy.
- [ ] Nous hooks de dades usen `useAuthLoad`.
- [ ] Missatges a l'usuari en català.
- [ ] `canEditView` / `canSeeView` comprovat on calgui.
- [ ] `toast.success` / `toast.error` per a feedback d'operacions.
- [ ] Estat de loading i error gestionats al component.

---

## 13. Referència ràpida: patrons freqüents

### Afegir un camp nou a una taula Supabase existent

1. Afegir la columna a Supabase (SQL o dashboard).
2. Actualitzar el conversor `toTipus()` al fitxer de store corresponent.
3. Actualitzar el conversor `tipusToRow()`.
4. Actualitzar el tipus TypeScript.
5. Actualitzar el formulari si cal.

### Afegir una nova icona de lucide

```tsx
import { NomIcona } from "lucide-react";
<NomIcona className="h-4 w-4" />
```

Consultar [lucide.dev](https://lucide.dev) per al nom exacte.

### Generar un ID nou

```ts
import { uid } from "@/lib/storage";
const id = uid(); // crypto.randomUUID()
```

### Combinar classes Tailwind condicionalment

```tsx
import { cn } from "@/lib/utils"; // clsx + tailwind-merge

<div className={cn(
  "base-class",
  isActive && "active-class",
  variant === "primary" && "primary-class",
)} />
```

### Mostrar un skeleton de càrrega

```tsx
import { Skeleton } from "@/components/ui/skeleton";

{loading ? (
  <div className="space-y-2">
    <Skeleton className="h-8 w-full" />
    <Skeleton className="h-8 w-3/4" />
  </div>
) : (
  <div>/* contingut real */</div>
)}
```
