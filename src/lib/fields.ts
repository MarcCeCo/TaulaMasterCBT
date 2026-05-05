// FieldMeta — model de dades per al diccionari de camps
export type FieldMeta = {
  col: string;              // codi intern (clau única, majúscules)
  name: string | null;      // nom descriptiu (Rosmiman)
  cbt_name: string | null;  // nom CBT / Revit
  type: string | null;      // format del paràmetre Revit (.txt)
  unit: string | null;      // unitat
  code: string | null;      // codi del paràmetre (pot estar buit)
  category: string | null;  // agrupació de paràmetre
  group: string | null;     // grup
  active: "Y" | "N";        // instància Revit
  discipline: string | null; // disciplina del paràmetre (Revit .txt)
  taulaAssoc: string | null; // taula associada (pot estar buida)
  order: number | null;
  scope: string;
};

// Un camp és "classificador" si tots els camps Revit i Rosmiman estan buits
export function isClassifier(f: FieldMeta): boolean {
  return (
    !f.type &&
    !f.code &&
    !f.category &&
    !f.group &&
    !f.cbt_name &&
    !f.discipline
  );
}

// Ordena mantenint cada camp sota el seu classificador pare
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
    const children = fieldsByClassifier.get(cls.col) ?? [];
    result.push(...children);
  }
  result.push(...noClassifier);
  return result;
}

// Camps base del diccionari
export const BASE_FIELDS: FieldMeta[] = [
  // ── CLASSIFICADOR: Identificació ──────────────────────────────
  { col: "CLS_ID", name: "Identificació", cbt_name: null, type: null, unit: null, code: null, category: null, group: null, active: "Y", discipline: null, taulaAssoc: null, order: 10, scope: "global" },
  { col: "TAG", name: "Tag", cbt_name: "CBT_TAG", type: "Text", unit: null, code: "TAG", category: "Paràmetre", group: "Identificació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 11, scope: "global" },
  { col: "SISTEMA", name: "Sistema", cbt_name: "CBT_SISTEMA", type: "Text", unit: null, code: "SISTEMA", category: "Paràmetre", group: "Identificació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 12, scope: "global" },
  { col: "SUBSIST", name: "Subsistema", cbt_name: "CBT_SUBSISTEMA", type: "Text", unit: null, code: "SUBSISTEMA", category: "Paràmetre", group: "Identificació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 13, scope: "global" },
  { col: "ACTIU", name: "Actiu", cbt_name: "CBT_ACTIU", type: "Text", unit: null, code: "ACTIU", category: "Paràmetre", group: "Identificació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 14, scope: "global" },
  { col: "TAULA", name: "Taula", cbt_name: "CBT_TAULA", type: "Text", unit: null, code: "TAULA", category: "Paràmetre", group: "Identificació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 15, scope: "global" },
  { col: "FABRICANT", name: "Fabricant", cbt_name: "CBT_FABRICANT", type: "Text", unit: null, code: "FABRICANT", category: "Paràmetre", group: "Identificació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 16, scope: "global" },
  { col: "MODEL", name: "Model", cbt_name: "CBT_MODEL", type: "Text", unit: null, code: "MODEL", category: "Paràmetre", group: "Identificació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 17, scope: "global" },
  { col: "NUMSERIE", name: "Número de sèrie", cbt_name: "CBT_NUMERO_SERIE", type: "Text", unit: null, code: "NUMERO_SERIE", category: "Paràmetre", group: "Identificació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 18, scope: "global" },
  { col: "ANYINST", name: "Any d'instal·lació", cbt_name: "CBT_ANY_INSTAL.LACIO", type: "Integer", unit: null, code: "ANY_INSTAL.LACIO", category: "Paràmetre", group: "Identificació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 19, scope: "global" },

  // ── CLASSIFICADOR: Característiques tècniques ─────────────────
  { col: "CLS_CT", name: "Característiques tècniques", cbt_name: null, type: null, unit: null, code: null, category: null, group: null, active: "Y", discipline: null, taulaAssoc: null, order: 30, scope: "global" },
  { col: "POTNOM", name: "Potència nominal", cbt_name: "CBT_POTENCIA_NOMINAL", type: "Number", unit: "kW", code: "POTENCIA_NOMINAL", category: "Paràmetre", group: "Característiques tècniques", active: "Y", discipline: "Mecànica", taulaAssoc: null, order: 31, scope: "global" },
  { col: "TENSNOM", name: "Tensió nominal", cbt_name: "CBT_TENSIO_NOMINAL", type: "Number", unit: "V", code: "TENSIO_NOMINAL", category: "Paràmetre", group: "Característiques tècniques", active: "Y", discipline: "Elèctrica", taulaAssoc: null, order: 32, scope: "global" },
  { col: "INTNOM", name: "Intensitat nominal", cbt_name: "CBT_INTENSITAT_NOMINAL", type: "Number", unit: "A", code: "INTENSITAT_NOMINAL", category: "Paràmetre", group: "Característiques tècniques", active: "Y", discipline: "Elèctrica", taulaAssoc: null, order: 33, scope: "global" },
  { col: "CABAL", name: "Cabal nominal", cbt_name: "CBT_CABAL", type: "Number", unit: "m³/h", code: "CABAL", category: "Paràmetre", group: "Característiques tècniques", active: "Y", discipline: "Mecànica", taulaAssoc: null, order: 34, scope: "global" },
  { col: "PRESSIO", name: "Pressió nominal", cbt_name: "CBT_PRESSIO_NOMINAL", type: "Number", unit: "Pa", code: "PRESSIO_NOMINAL", category: "Paràmetre", group: "Característiques tècniques", active: "Y", discipline: "Mecànica", taulaAssoc: null, order: 35, scope: "global" },
  { col: "TEMP", name: "Temperatura de treball", cbt_name: "CBT_TEMPERATURA_TREBALL", type: "Number", unit: "°C", code: "TEMPERATURA_TREBALL", category: "Paràmetre", group: "Característiques tècniques", active: "Y", discipline: "Mecànica", taulaAssoc: null, order: 36, scope: "global" },
  { col: "PES", name: "Pes", cbt_name: "CBT_PES", type: "Number", unit: "kg", code: "PES", category: "Paràmetre", group: "Característiques tècniques", active: "Y", discipline: "Mecànica", taulaAssoc: null, order: 37, scope: "global" },
  { col: "CAPACITAT", name: "Capacitat", cbt_name: "CBT_CAPACITAT", type: "Number", unit: "L", code: "CAPACITAT", category: "Paràmetre", group: "Característiques tècniques", active: "Y", discipline: "Mecànica", taulaAssoc: null, order: 38, scope: "global" },

  // ── CLASSIFICADOR: Instal·lació ────────────────────────────────
  { col: "CLS_INS", name: "Instal·lació", cbt_name: null, type: null, unit: null, code: null, category: null, group: null, active: "Y", discipline: null, taulaAssoc: null, order: 50, scope: "global" },
  { col: "UBICAC", name: "Ubicació", cbt_name: "CBT_UBICACIO", type: "Text", unit: null, code: "UBICACIO", category: "Paràmetre", group: "Instal·lació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 51, scope: "global" },
  { col: "PLANTA", name: "Planta", cbt_name: "CBT_PLANTA", type: "Text", unit: null, code: "PLANTA", category: "Paràmetre", group: "Instal·lació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 52, scope: "global" },
  { col: "ESPAI", name: "Espai / Local", cbt_name: "CBT_ESPAI", type: "Text", unit: null, code: "ESPAI", category: "Paràmetre", group: "Instal·lació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 53, scope: "global" },
  { col: "DATAINS", name: "Data d'instal·lació", cbt_name: "CBT_DATA_INSTAL.LACIO", type: "Date", unit: null, code: "DATA_INSTAL.LACIO", category: "Paràmetre", group: "Instal·lació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 54, scope: "global" },

  // ── CLASSIFICADOR: Manteniment ─────────────────────────────────
  { col: "CLS_MAN", name: "Manteniment", cbt_name: null, type: null, unit: null, code: null, category: null, group: null, active: "Y", discipline: null, taulaAssoc: null, order: 70, scope: "global" },
  { col: "VIDUTIL", name: "Vida útil estimada", cbt_name: "CBT_VIDA_UTIL", type: "Integer", unit: "anys", code: "VIDA_UTIL", category: "Paràmetre", group: "Manteniment", active: "Y", discipline: "Comú", taulaAssoc: null, order: 71, scope: "global" },
  { col: "FRQMAN", name: "Freqüència manteniment", cbt_name: "CBT_FREQUENCIA_MANTENIMENT", type: "Text", unit: null, code: "FREQUENCIA_MANTENIMENT", category: "Paràmetre", group: "Manteniment", active: "Y", discipline: "Comú", taulaAssoc: null, order: 72, scope: "global" },
  { col: "ULTMAN", name: "Última revisió", cbt_name: "CBT_ULTIMA_REVISIO", type: "Date", unit: null, code: "ULTIMA_REVISIO", category: "Paràmetre", group: "Manteniment", active: "Y", discipline: "Comú", taulaAssoc: null, order: 73, scope: "global" },
  { col: "PROXMAN", name: "Propera revisió", cbt_name: "CBT_PROPERA_REVISIO", type: "Date", unit: null, code: "PROPERA_REVISIO", category: "Paràmetre", group: "Manteniment", active: "Y", discipline: "Comú", taulaAssoc: null, order: 74, scope: "global" },
  { col: "CONTMAN", name: "Contracte manteniment", cbt_name: "CBT_CONTRACTE_MANTENIMENT", type: "Text", unit: null, code: "CONTRACTE_MANTENIMENT", category: "Paràmetre", group: "Manteniment", active: "Y", discipline: "Comú", taulaAssoc: null, order: 75, scope: "global" },

  // ── CLASSIFICADOR: Documentació ───────────────────────────────
  { col: "CLS_DOC", name: "Documentació", cbt_name: null, type: null, unit: null, code: null, category: null, group: null, active: "Y", discipline: null, taulaAssoc: null, order: 90, scope: "global" },
  { col: "REFCAT", name: "Referència catàleg", cbt_name: "CBT_REFERENCIA_CATALEG", type: "Text", unit: null, code: "REFERENCIA_CATALEG", category: "Paràmetre", group: "Documentació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 91, scope: "global" },
  { col: "URLFIT", name: "URL fitxa tècnica", cbt_name: "CBT_URL_FITXA_TECNICA", type: "Text", unit: null, code: "URL_FITXA_TECNICA", category: "Paràmetre", group: "Documentació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 92, scope: "global" },
  { col: "OBSV", name: "Observacions", cbt_name: "CBT_OBSERVACIONS", type: "Text", unit: null, code: "OBSERVACIONS", category: "Paràmetre", group: "Documentació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 93, scope: "global" },
  { col: "ORIGEN", name: "Origen informació", cbt_name: "CBT_ORIGEN_INFORMACIO", type: "Text", unit: null, code: "ORIGEN_INFORMACIO", category: "Paràmetre", group: "Documentació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 94, scope: "global" },
  { col: "DOCTEC", name: "Documentació tècnica", cbt_name: "CBT_DOCUMENTACIO_TECNICA", type: "Text", unit: null, code: "DOCUMENTACIO_TECNICA", category: "Paràmetre", group: "Documentació", active: "Y", discipline: "Comú", taulaAssoc: null, order: 95, scope: "global" },
];
