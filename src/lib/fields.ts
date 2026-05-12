// FieldMeta — model de dades per al diccionari de camps
// Columnes alineades amb la taula Supabase `fields`
export type FieldMeta = {
  col:             string;        // clau primària (Nom de l'Excel, majúscules)
  codi:            string | null; // "Codi"
  taula_assoc:     string | null; // "Taula associada"
  tipus_dada:      string | null; // "Tipus dada"
  cbt:             string | null; // "CBT"
  format_param:    string | null; // "Format paràmetre"
  agrupacio_revit: string | null; // "Agrupació Revit"
  grup_txt:        string | null; // "Grup .txt"
  instancia_revit: string | null; // "Instència Revit"
  disciplina:      string | null; // "Disciplina"
  classificador:   string | null; // "Classificador" (override manual del classificador)
};

// Un camp és "classificador" si tots els camps tècnics estan buits
export function isClassifier(f: FieldMeta): boolean {
  return (
    !f.cbt &&
    !f.format_param &&
    !f.agrupacio_revit &&
    !f.disciplina &&
    !f.codi
  );
}

// Classificadors automàtics per rang de codi numèric
// Quan un camp NO té codi, va al grup GENERAL per defecte
export const AUTO_CLASSIFIERS: { name: string; min: number; max: number }[] = [
  { name: "GENERAL",                   min: 0,   max: 199 },
  { name: "MECANIQUES",                min: 200, max: 399 },
  { name: "GEOMETRIQUES A-F",          min: 400, max: 599 },
  { name: "ELECTRIQUES",               min: 600, max: 699 },
  { name: "CARACTERISTIQUES TECNIQUES", min: 700, max: 799 },
  { name: "MOTOR I REDUCTOR",          min: 800, max: 999 },
];

/** Retorna el nom del classificador automàtic per a un codi numèric donat.
 *  Si el codi és null/buit o no és numèric, retorna "GENERAL". */
export function autoClassifierForCodi(codi: string | null): string {
  if (!codi) return "GENERAL";
  const n = parseFloat(codi);
  if (isNaN(n)) return "GENERAL";
  for (const ac of AUTO_CLASSIFIERS) {
    if (n >= ac.min && n <= ac.max) return ac.name;
  }
  return "GENERAL";
}

/** Retorna el classificador efectiu d'un camp:
 *  - Si té el camp classificador informat → s'usa com a override manual
 *  - Sinó → s'infereix del rang numèric del codi */
export function effectiveClassifier(f: FieldMeta): string {
  if (f.classificador) return f.classificador;
  return autoClassifierForCodi(f.codi);
}

// Ordena els camps d'un grup: sense codi primer, després per codi numèric ascending
function sortGroupFields(groupFields: FieldMeta[]): FieldMeta[] {
  const noCodi = groupFields.filter((f) => !f.codi);
  const withCodi = groupFields
    .filter((f) => !!f.codi)
    .sort((a, b) => {
      const na = parseFloat(a.codi!);
      const nb = parseFloat(b.codi!);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return (a.codi!).localeCompare(b.codi!, undefined, { numeric: true });
    });
  return [...noCodi, ...withCodi];
}

/**
 * Ordena els camps mantenint-los sota el seu classificador.
 *
 * Estratègia (dues passades per evitar problemes d'ordre a la BD):
 *  PASSADA 1 — Classificació: cada camp no-classificador s'assigna al seu grup.
 *    - Si és un classificador explícit (isClassifier=true), s'usa com a capçalera.
 *    - Si és un camp normal sense classificador explícit, s'agrupa per rang de codi
 *      (o pel camp `classificador` si té override manual).
 *  PASSADA 2 — Construcció del resultat en ordre fix:
 *    - Primer els classificadors explícits amb els seus camps.
 *    - Després els classificadors automàtics (AUTO_CLASSIFIERS) amb els seus camps,
 *      només els que tinguin membres, en l'ordre definit a AUTO_CLASSIFIERS.
 */
export function sortByClassification(fields: FieldMeta[]): FieldMeta[] {
  const result: FieldMeta[] = [];

  // Separa classificadors explícits i camps normals (passada 1)
  const explicitClassifiers: FieldMeta[] = [];
  const fieldsByExplicitCls = new Map<string, FieldMeta[]>();
  const fieldsForAutoGroup: FieldMeta[] = [];

  // Primer recollim tots els classificadors explícits per saber quins existeixen
  const explicitClsNames = new Set(fields.filter(isClassifier).map((f) => f.col));

  // Assignació: cada camp normal va al seu classificador explícit o al grup automàtic
  // Construïm el mapa de classificadors explícits i els seus fills
  let currentExplicitCls: string | null = null;
  for (const f of fields) {
    if (isClassifier(f)) {
      explicitClassifiers.push(f);
      currentExplicitCls = f.col;
      if (!fieldsByExplicitCls.has(f.col)) fieldsByExplicitCls.set(f.col, []);
    } else {
      if (currentExplicitCls) {
        fieldsByExplicitCls.get(currentExplicitCls)!.push(f);
      } else {
        fieldsForAutoGroup.push(f);
      }
    }
  }

  // Els camps que tenen un classificador explícit com a pare van amb ell,
  // però els que han quedat sense pare (apareixien abans a la BD) els reassignem.
  // Recollim tots els camps normals que NO van sota cap classificador explícit
  // i els afegim a fieldsForAutoGroup si no hi son ja.
  // (En el bucle anterior, si un camp apareixia DESPRÉS d'un cls explícit, ja és al mapa.
  //  Si apareixia ABANS, ja va a fieldsForAutoGroup. Correcte.)

  // Passada 2 — Construcció del resultat

  // 2a. Classificadors explícits amb els seus camps
  for (const cls of explicitClassifiers) {
    result.push(cls);
    result.push(...sortGroupFields(fieldsByExplicitCls.get(cls.col) ?? []));
  }

  // 2b. Camps sense classificador explícit → agrupació automàtica per rang
  if (fieldsForAutoGroup.length > 0) {
    const byAutoClass = new Map<string, FieldMeta[]>();
    for (const ac of AUTO_CLASSIFIERS) byAutoClass.set(ac.name, []);

    for (const f of fieldsForAutoGroup) {
      const clsName = effectiveClassifier(f);
      if (!byAutoClass.has(clsName)) byAutoClass.set(clsName, []);
      byAutoClass.get(clsName)!.push(f);
    }

    // Construcció en l'ordre fix d'AUTO_CLASSIFIERS (no depèn de l'ordre de la BD)
    for (const ac of AUTO_CLASSIFIERS) {
      const members = byAutoClass.get(ac.name) ?? [];
      if (members.length === 0) continue;
      const clsRow: FieldMeta = {
        col: ac.name,
        codi: null, taula_assoc: null, tipus_dada: null,
        cbt: null, format_param: null, agrupacio_revit: null,
        grup_txt: null, instancia_revit: null, disciplina: null,
        classificador: null,
      };
      result.push(clsRow);
      result.push(...sortGroupFields(members));
    }
  }

  return result;
}
