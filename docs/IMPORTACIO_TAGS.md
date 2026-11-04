# Importació de TAGs des d'Excel — especificació de l'MVP

## Objectiu

Crear els TAGs d'un projecte a partir d'un llistat d'equips (Excel/CSV) sense
haver-los d'introduir un a un, i sense exigir unes columnes fixes.

## Flux (botó «Importa TAGs» al detall d'un projecte actiu)

1. **Plantilla.** L'usuari descarrega la plantilla, l'omple i la puja. Té les
   mateixes columnes que l'exportació de la revisió (Línia, Denominació,
   Codi equip, CCM, Funció, Duplicitat, Ordre procés, TAG, Estat, Confiança,
   Observacions). Només són obligatòries Línia i
   Denominació; si s'omplen Codi equip, CCM, Funció o Duplicitat, la
   plataforma els respecta. Un fitxer revisat i exportat es pot tornar a pujar.
2. **Columnes.** Si el fitxer és la plantilla, les columnes s'assignen soles.
   Si és un altre format, es detecten automàticament (menys fiable) i
   l'usuari ho pot corregir. També indica el dígit CCM (0-9) i si les
   unitats iguals o de reserva comparteixen funció (lletres A, B, C...).
3. **Revisió.** Taula amb el codi d'equip, funció, duplicitat i TAG proposats,
   amb estat i confiança (alta / mitjana / revisar). Tot és editable. Es
   comprova contra el projecte, el llistat Rosmiman i la mateixa importació.
4. **Confirmació.** Es creen només les files marcades i vàlides, com a TAGs
   «pendent». La línia d'origen es desa al comentari («Línia L-5»).

## Ordre de procés

La columna «Ordre procés» (1, 2, 3...) permet indicar el sentit del fluid
segons el P&ID. La numeració de les funcions segueix aquest ordre; si no
s'omple, segueix l'ordre del fitxer.

## Detecció de columnes (formats que no són la plantilla) (`src/lib/tagImport/detectColumns.ts`)

- **Fila de capçalera:** la que té més textos curts i més coincidències amb
  sinònims (denominació, descripció, nom, equip...).
- **Rol de cada columna:** puntuació combinada del nom de la capçalera i del
  contingut (vocabulari d'equips reconegut, longitud mitjana del text,
  codis curts tipus `L-5`).
- Una fila sense línia que només porta un text entre
  parèntesis s'afegeix a la fila anterior (p. ex. «(H2S, CO2, CH4 i O2)»).

## Regles denominació → codi (`src/lib/tagImport/rules.ts`)

- Regles deterministes i auditables, **sense IA**. Els patrons s'apliquen
  sobre el text normalitzat (sense accents ni majúscules).
- Obtingudes dels precedents de Granollers (ED001) i Montornès (ED004).
- Cada regla té codi, confiança, nota, alternatives i, opcionalment, la marca
  «unitats iguals» (bombes, bufants, electrovàlvules...).
- Hi ha regles de «sense tag» per a alimentacions generals (endolls,
  enllumenat, maniobres, instrumentació, cremadors...).

## Numeració (`src/lib/tagImport/proposeTags.ts`)

- Funció: primera lliure després de la més alta existent per a
  instal·lació + codi + CCM, mirant el projecte **i** Rosmiman. No es
  reutilitzen buits.
- Unitats iguals o de reserva: mateixa funció, lletres A, B, C...
- Els instruments (cabalímetres, transmissors...) tenen sempre funció pròpia.
- CCM: tag `CCM0_00N` (CCM 0 i funció = número del CCM).
- **Límit:** sense la columna «Ordre procés», la numeració segueix l'ordre del
  fitxer, no el sentit del fluid que demana el manual BIM. Cal revisar-la amb
  el P&ID.

## Decisions de disseny

- Les regles viuen al codi (no a Supabase) en aquesta fase: no cal cap
  migració de base de dades. L'administració de regles des de la plataforma
  queda per a una segona fase.
- Només es poden crear tags amb codis que existeixin a la Taula Master.
- La importació s'atura al primer error. Els tags ja creats surten després
  com a «Ja és al projecte», així que es pot tornar a executar sense duplicar.
- Atenció: la Preview de Vercel usa el mateix Supabase que producció.

## Fases següents

1. Administració de regles i aprenentatge a partir de les correccions.
2. Memòria del mapatge de columnes per a formats que es repeteixen.
3. Importació des de PDF (extracció de taules, més fràgil).
4. Contrast amb el P&ID: llegir el text d'un PDF vectorial i comparar els
   tags i descripcions que hi apareixen amb el llistat (detectar equips que
   falten o sobren). L'ordre del fluid continua requerint revisió humana.
