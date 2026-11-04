// src/lib/tagImport/rules.ts
// Regles denominació → codi d'equip. Són deterministes i auditables (sense IA).
// Els patrons s'apliquen sobre el text normalitzat (vegeu norm()): minúscules,
// sense accents ni punts. Es van obtenir dels precedents de Granollers (ED001)
// i Montornès del Vallès (ED004). L'ordre és important: guanya la primera.

import { norm } from "./normalize";
import type { Confianca } from "./types";

export interface TagRule {
  id: string;
  patro: RegExp;
  codi: string;
  confianca: Confianca;
  nota?: string;
  alternatives?: string[];
  /** Unitats iguals o de reserva: comparteixen funció i es diferencien amb lletra */
  bessones?: boolean;
  /** CCM: el tag usa CCM 0 i la funció és el número del CCM */
  especial?: "ccm";
}

export interface NoTagRule {
  patro: RegExp;
  motiu: string;
}

/** Línies que no són equips (alimentacions generals, endolls, enllumenat...) */
export const NO_TAG_RULES: NoTagRule[] = [
  {
    patro: /\bendolls?\b|enllumenat|illuminacio|maniobres/,
    motiu: "Alimentació general (endolls, enllumenat o maniobres).",
  },
  {
    patro: /instrumentacio i sensoria/,
    motiu: "Línia d'instrumentació, no és un equip.",
  },
  {
    patro: /^extractors? quadre/,
    motiu: "Extractors del quadre elèctric: part del quadre.",
  },
  {
    patro: /cremador/,
    motiu: "Alimentació del cremador: forma part de la caldera.",
  },
];

export const DEFAULT_RULES: TagRule[] = [
  {
    id: "ccm",
    patro: /^ccm\d|\bccm\b|centre control motors/,
    codi: "CCM0",
    confianca: "mitjana",
    especial: "ccm",
    nota: "CCM: tag CCM0 amb la funció igual al número del CCM (R06 → CCM0_006A). Comprova que no existeixi ja.",
  },
  {
    id: "variador",
    patro: /^vf\b|^variador/,
    codi: "VF00",
    confianca: "alta",
    nota: "Variador de freqüència: VF00.",
  },
  {
    id: "caldera",
    patro: /^(linia )?(quadre )?caldera|^caldera/,
    codi: "C000",
    confianca: "mitjana",
    bessones: true,
    nota: "Es tagga la caldera (C000), no la línia del seu quadre.",
  },
  {
    id: "bomba-circuit",
    patro: /^bomba circuit/,
    codi: "BCCS",
    confianca: "alta",
    bessones: true,
    nota: "Bomba de circuit (aigua calenta o recuperació): BCCS.",
    alternatives: ["BCS0"],
  },
  {
    id: "bomba-recirculacio",
    patro: /^bomba recirculacio/,
    codi: "BCCS",
    confianca: "alta",
    bessones: true,
    nota: "Bomba de recirculació: BCCS.",
    alternatives: ["BCG0"],
  },
  {
    id: "bomba-engreix",
    patro: /^bomba (d )?engr(ase|eix)/,
    codi: "BP00",
    confianca: "alta",
    nota: "Bomba d'engreix: BP00.",
  },
  {
    id: "bomba-dosificacio",
    patro: /^bomba dosificacio/,
    codi: "BCG0",
    confianca: "mitjana",
    bessones: true,
    alternatives: ["BP00", "BCCS"],
  },
  {
    id: "bomba-solvent",
    patro: /^bomba solvent/,
    codi: "BCCS",
    confianca: "mitjana",
    bessones: true,
    alternatives: ["BCG0"],
  },
  {
    id: "bomba-rehidratacio",
    patro: /^bomba rehidratacio|^bombament/,
    codi: "BCG0",
    confianca: "mitjana",
    bessones: true,
    alternatives: ["BCCS"],
  },
  {
    id: "bomba-biogas",
    patro: /^bomba biogas/,
    codi: "SG00",
    confianca: "revisar",
    bessones: true,
    nota: "No hi ha una bomba de biogàs al llistat CBT.",
    alternatives: ["B000", "BF00"],
  },
  {
    id: "bomba-horitzontal",
    patro: /^bomba (horitzontal|centrif)/,
    codi: "BCCS",
    confianca: "mitjana",
    bessones: true,
    nota: "Centrífuga de cambra seca. Si és submergible, BCS0.",
    alternatives: ["BCS0", "BCRH"],
  },
  {
    id: "bomba",
    patro: /^bomba\b/,
    codi: "BCCS",
    confianca: "revisar",
    bessones: true,
    nota: "Tipus de bomba no identificat.",
    alternatives: ["BCS0", "BCG0", "BP00"],
  },
  {
    id: "agitador",
    patro: /^agitador/,
    codi: "AV00",
    confianca: "alta",
    nota: "Agitador/mesclador de digestor: AV00.",
  },
  {
    id: "bufador-gasometre",
    patro: /^(bufant|bufador|bufadora) gasometre/,
    codi: "VTC0",
    confianca: "alta",
    bessones: true,
  },
  {
    id: "bufador-cogeneracio",
    patro: /^(bufant|bufador|bufadora).*cogeneracio/,
    codi: "VTC0",
    confianca: "mitjana",
    bessones: true,
    alternatives: ["BF00"],
  },
  {
    id: "bufador",
    patro: /^(bufant|bufador|bufadora)/,
    codi: "BF00",
    confianca: "revisar",
    bessones: true,
    alternatives: ["VTC0"],
  },
  {
    id: "compressor",
    patro: /^compres/,
    codi: "CPSG",
    confianca: "alta",
    bessones: true,
    nota: "Compressor de gas: CPSG.",
  },
  {
    id: "extractor",
    patro: /^extractor/,
    codi: "VTH0",
    confianca: "alta",
    bessones: true,
  },
  {
    id: "valvula-3-vies",
    patro: /^valvula (de )?(3|tres) vies/,
    codi: "V3VA",
    confianca: "alta",
  },
  {
    id: "valvula-regulacio",
    patro: /^valvula (de )?regulacio/,
    codi: "VPA0",
    confianca: "revisar",
    nota: "Vàlvula de regulació amb actuador: papallona automàtica. Confirma el tipus.",
    alternatives: ["VGBA", "VBA0"],
  },
  {
    id: "electrovalvula",
    patro: /^electrovalv/,
    codi: "VEV0",
    confianca: "alta",
    bessones: true,
  },
  {
    id: "cabalimetre",
    patro: /cabalimetre|cabalimetro|caudalimetro/,
    codi: "FIT0",
    confianca: "alta",
    nota: "Cabalímetre transmissor indicador: FIT0.",
    alternatives: ["FTR0"],
  },
  {
    id: "sonda-temperatura",
    patro: /^sonda (de )?temp/,
    codi: "TP00",
    confianca: "mitjana",
  },
  {
    id: "transmissor-temperatura",
    patro: /^(transmis\w*|sensor) (de )?temp/,
    codi: "TT00",
    confianca: "mitjana",
    nota: "Si només és una sonda, TP00.",
    alternatives: ["TP00", "TIT0"],
  },
  {
    id: "transmissor-pressio",
    patro: /^(transmis\w*|sensor) (de )?pres/,
    codi: "PT00",
    confianca: "mitjana",
    alternatives: ["PIT0"],
  },
  {
    id: "nivell",
    patro: /^(transmis\w*|mesurador|sensor)? ?nivell/,
    codi: "LIT0",
    confianca: "mitjana",
    alternatives: ["LT00", "LS00"],
  },
  {
    id: "analitzador-gas",
    patro: /^analitzador.*gas/,
    codi: "BGA0",
    confianca: "mitjana",
    alternatives: ["MGA0"],
  },
  {
    id: "detector-h2s",
    patro: /sulfhidric|\bh2s\b/,
    codi: "GIT0",
    confianca: "mitjana",
    alternatives: ["MAST"],
  },
  {
    id: "plc",
    patro: /\bplc\b/,
    codi: "PLC0",
    confianca: "mitjana",
  },
  {
    id: "motor-persiana",
    patro: /^motor persiana/,
    codi: "TPCP",
    confianca: "revisar",
    bessones: true,
    nota: "Persiana motoritzada: no hi ha codi específic.",
    alternatives: ["ATMT"],
  },
  {
    id: "cargol",
    patro: /^motor cargol|^cargol/,
    codi: "CTP0",
    confianca: "mitjana",
    bessones: true,
    nota: "Cargol transportador.",
  },
  {
    id: "quadre",
    patro: /quadre local|^subquadre|^alimentacio quadre/,
    codi: "QEBT",
    confianca: "mitjana",
    bessones: true,
    nota: "Es tagga el quadre. Si prefereixes l'equip que alimenta, canvia el codi.",
  },
];

export type Classification =
  | { kind: "equip"; rule: TagRule }
  | { kind: "no-tag"; motiu: string }
  | { kind: "desconegut" };

export function classifyDenominacio(
  text: string,
  rules: TagRule[] = DEFAULT_RULES,
): Classification {
  const n = norm(text);
  if (!n) return { kind: "desconegut" };
  for (const r of NO_TAG_RULES) {
    if (r.patro.test(n)) return { kind: "no-tag", motiu: r.motiu };
  }
  for (const rule of rules) {
    if (rule.patro.test(n)) return { kind: "equip", rule };
  }
  return { kind: "desconegut" };
}
