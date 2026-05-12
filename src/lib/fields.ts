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
 * Estratègia:
 *  1. Si la llista JA conté classificadors explícits (files amb isClassifier=true),
 *     s'usa el comportament original: cada camp queda sota el seu classificador pare.
 *  2. Si NO hi ha cap classificador explícit, s'aplica l'agrupació automàtica per rang
 *     de codi: es generen classificadors virtuals (AUTO_CLASSIFIERS) i s'hi col·loquen
 *     els camps corresponents.
 *  3. Si hi ha BARREJA (alguns classificadors explícits, alguns sense), els camps sense
 *     classificador explícit s'agrupen per rang automàticament i s'intercalen al final.
 */
export function sortByClassification(fields: FieldMeta[]): FieldMeta[] {
  const result: FieldMeta[] = [];
  const explicitClassifiers: FieldMeta[] = [];
  const fieldsByExplicitCls = new Map<string, FieldMeta[]>();
  const fieldsWithoutExplicitCls: FieldMeta[] = [];

  let currentCls: string | null = null;

  for (const f of fields) {
    if (isClassifier(f)) {
      explicitClassifiers.push(f);
      currentCls = f.col;
      if (!fieldsByExplicitCls.has(f.col)) fieldsByExplicitCls.set(f.col, []);
    } else {
      if (currentCls) {
        fieldsByExplicitCls.get(currentCls)!.push(f);
      } else {
        fieldsWithoutExplicitCls.push(f);
      }
    }
  }

  // Camps amb classificadors explícits → comportament original
  for (const cls of explicitClassifiers) {
    result.push(cls);
    result.push(...sortGroupFields(fieldsByExplicitCls.get(cls.col) ?? []));
  }

  // Camps sense classificador explícit → agrupació automàtica per rang de codi
  if (fieldsWithoutExplicitCls.length > 0) {
    // Agrupa per classificador automàtic
    const byAutoClass = new Map<string, FieldMeta[]>();
    for (const ac of AUTO_CLASSIFIERS) byAutoClass.set(ac.name, []);

    for (const f of fieldsWithoutExplicitCls) {
      const clsName = effectiveClassifier(f);
      if (!byAutoClass.has(clsName)) byAutoClass.set(clsName, []);
      byAutoClass.get(clsName)!.push(f);
    }

    // Només mostra els classificadors automàtics que tinguin camps
    for (const ac of AUTO_CLASSIFIERS) {
      const members = byAutoClass.get(ac.name) ?? [];
      if (members.length === 0) continue;
      // Classificador virtual: igual que un FieldMeta classificador
      const clsRow: FieldMeta = {
        col: ac.name,
        codi: null, taula_assoc: null, tipus_dada: null,
        cbt: null, format_param: null, agrupacio_revit: null,
        grup_txt: null, instancia_revit: null, disciplina: null,
      };
      result.push(clsRow);
      result.push(...sortGroupFields(members));
    }
  }

  return result;
}
