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

// Ordena mantenint cada camp sota el seu classificador pare,
// i dins de cada grup: sense codi primer, amb codi per ordre numèric
export function sortByClassification(fields: FieldMeta[]): FieldMeta[] {
  const result: FieldMeta[] = [];
  const classifiers: FieldMeta[] = [];
  const fieldsByClassifier = new Map<string, FieldMeta[]>();
  const noClassifier: FieldMeta[] = [];

  let currentCls: string | null = null;

  for (const f of fields) {
    if (isClassifier(f)) {
      classifiers.push(f);
      currentCls = f.col;
      if (!fieldsByClassifier.has(f.col)) fieldsByClassifier.set(f.col, []);
    } else {
      if (currentCls) {
        fieldsByClassifier.get(currentCls)!.push(f);
      } else {
        noClassifier.push(f);
      }
    }
  }

  for (const cls of classifiers) {
    result.push(cls);
    result.push(...sortGroupFields(fieldsByClassifier.get(cls.col) ?? []));
  }
  result.push(...sortGroupFields(noClassifier));
  return result;
}
