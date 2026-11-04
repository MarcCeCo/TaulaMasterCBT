# Importació de TAGs des d'Excel

## Objectiu

Crear els TAGs d'un projecte a partir d'un llistat d'equips en l'ordre del
fluid, sense haver-los d'introduir un a un. El llistat el fa l'encarregat amb
una plantilla corporativa i la plataforma el llegeix directament.

## Plantilla (`public/docs/Plantilla_importacio_tags.xlsx`)

Full **Instruccions** (primer), full **Equips** (el que s'omple) i full
**Exemple**. Columnes del full Equips:

| Columna | Cal omplir-la? | Notes |
| --- | --- | --- |
| Ordre procés | **Obligatòria** | Número segons el sentit del fluid. Mateix número = grup (servei + reserva). |
| Línia | Opcional | Referència de l'equip. Es desa als comentaris del tag («Línia L-5»). |
| Denominació | **Obligatòria** | Nom de l'equip. |
| Codi equip | Opcional | 4 caràcters. Si és buit, la plataforma el proposa amb les regles. |
| CCM | **Obligatòria** | Dígit 0-9. La plataforma el llegeix de cada fila. |
| Funció | Opcional | 2 dígits. Si és buit, la plataforma assigna la primera lliure. |
| Duplicitat | Opcional | Lletra (A, B, C...). Si és buida, es dedueix de la denominació. |
| TAG, Estat, Confiança, Observacions | La plataforma | No s'omplen a mà. |

Estat i Confiança tenen els mateixos colors que a la plataforma (verd,
taronja i vermell; gris per a «Sense tag»).

## Flux (botó «Importa TAGs» al detall d'un projecte actiu)

1. **Fitxer.** Es descarrega la plantilla (fitxer estàtic) i, un cop omplerta,
   es puja. També s'accepten altres Excel/CSV, amb detecció automàtica de
   columnes (menys fiable).
2. **Columnes.** Si és la plantilla, es llegeix el full «Equips», les columnes
   s'assignen soles i **els CCM es detecten de cada fila** (es mostren al
   resum). No cal indicar el CCM enlloc més. Només s'ha de triar, si el
   projecte en té més d'un, el codi d'instal·lació.
3. **Revisió.** Taula editable amb codi, CCM, funció, duplicitat, TAG, estat i
   confiança. Es comprova contra el projecte, Rosmiman i la mateixa
   importació. Les files sense Ordre procés o sense CCM surten com a error
   («Falta Ordre procés o CCM») i no es poden crear.
4. **Confirmació.** Es creen només les files marcades i vàlides, com a «pendent».

El botó **Exporta revisió** descarrega el mateix format de la plantilla, amb
TAG, Estat i Confiança omplerts i els colors. Es pot tornar a pujar.

## Numeració

- Funció: primera lliure (màxima existent + 1) per a instal·lació + codi + CCM,
  mirant el projecte i Rosmiman. No es reutilitzen buits.
- S'assigna seguint l'**Ordre procés** (i, a igualtat, l'ordre de les files).
- Unitats iguals o de reserva: mateixa funció, lletres A, B, C...
- Els instruments (cabalímetres, transmissors...) tenen sempre funció pròpia.
- CCM com a equip: tag `CCM0_00N` (CCM 0 i funció = número del CCM).
- **Límit:** l'ordre de procés l'indica l'encarregat; la plataforma no el
  dedueix del P&ID.

## Regles denominació → codi (`src/lib/tagImport/rules.ts`)

Regles deterministes i auditables, **sense IA**, sobre el text normalitzat
(sense accents ni majúscules). Obtingudes dels precedents de Granollers (ED001)
i Montornès (ED004). Hi ha regles de «sense tag» per a alimentacions generals.

## Arquitectura

- `src/lib/tagImport/`: `template.ts` (lectura i descàrrega de la plantilla),
  `detectColumns.ts` (altres formats), `rules.ts`, `proposeTags.ts`
  (proposta i avaluació), `exportRevision.ts` (exportació amb ExcelJS),
  `readWorkbook.ts`, `normalize.ts`, `types.ts`.
- `src/components/cbt/ImportTagsDialog.tsx`: diàleg.
- ExcelJS i xlsx es carreguen de manera lazy (només en importar o exportar).

## Manteniment de la plantilla

- L'exportació carrega el fitxer de `public/docs/` i hi escriu les files, així
  que **el nom del full («Equips»), la fila de capçalera (4) i les columnes han
  de ser els de la plantilla**. Si es canvia el disseny, cal mantenir-ho.
- El logo de la plantilla ha de tenir el format `xdr:` al XML del dibuix (ExcelJS
  no llegeix els dibuixos sense prefix). Si es regenera amb openpyxl, cal
  reescriure'ls.
- `vercel.json` redirigeix tot a `index.html`: si el fitxer no hi és, el
  navegador rep HTML. El codi ho detecta i mostra un error.

## Decisions de disseny

- Les regles viuen al codi (no a Supabase): no cal cap migració.
- Només es poden crear tags amb codis que existeixin a la Taula Master.
- La importació s'atura al primer error. Els tags ja creats surten després com
  a «Ja és al projecte», així que es pot tornar a executar sense duplicar.
- Atenció: la Preview de Vercel usa el mateix Supabase que producció.

## Fases següents

1. Administració de regles i aprenentatge a partir de les correccions.
2. Contrast amb el P&ID (text d'un PDF vectorial) per detectar equips que
   falten o sobren.
