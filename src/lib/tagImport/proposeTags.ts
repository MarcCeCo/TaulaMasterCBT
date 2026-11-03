// src/lib/tagImport/proposeTags.ts
// Proposta de tags a partir de les files importades: assigna codi d'equip
// (regles), funció (primera lliure) i duplicitat (lletres per a unitats iguals),
// i avalua cada fila contra el projecte i el llistat Rosmiman.

import { classifyDenominacio, DEFAULT_RULES, type TagRule } from "./rules";
import { groupKey } from "./normalize";
import type { ProposedRow, RowEvaluation, SourceRow } from "./types";

export function buildTag(
  codiInstallacio: string,
  codiEquip: string,
  ccm: string,
  funcio: string,
  duplicitat: string,
): string {
  return `${codiInstallacio.toUpperCase()}_${codiEquip.toUpperCase()}_${ccm}${funcio.padStart(2, "0")}${duplicitat.toUpperCase()}`;
}

/** Primera funció lliure (màxima existent + 1) per a instal·lació, codi i CCM. */
export function nextFreeFunction(
  existingTags: string[],
  codiInstallacio: string,
  codiEquip: string,
  ccm: string,
): number {
  const prefix = `${codiInstallacio.toUpperCase()}_${codiEquip.toUpperCase()}_${ccm}`;
  let max = 0;
  for (const t of existingTags) {
    const tag = t.trim().toUpperCase();
    if (!tag.startsWith(prefix)) continue;
    const m = /^(\d{2})[A-Z]$/.exec(tag.slice(prefix.length));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

export interface ProposeOptions {
  codiInstallacio: string;
  ccm: string;
  /** Tags ja existents (projecte + Rosmiman) per calcular la numeració */
  existingTags: string[];
  /** Unitats iguals o de reserva: mateixa funció i lletres A, B, C... */
  agrupaBessones: boolean;
  rules?: TagRule[];
}

function ccmNumberFromText(text: string): string {
  const m = /\bccm\s?0?(\d)|\br\s?0?(\d)\b/i.exec(text);
  if (m) return m[1] ?? m[2] ?? "";
  return "";
}

export function proposeRows(
  rows: SourceRow[],
  opts: ProposeOptions,
): ProposedRow[] {
  const rules = opts.rules ?? DEFAULT_RULES;
  const counters = new Map<string, number>();
  const groups = new Map<string, { funcio: number; count: number }>();

  return rows.map((row): ProposedRow => {
    const base: ProposedRow = {
      ...row,
      kind: "desconegut",
      codiEquip: "",
      confianca: null,
      nota: "",
      alternatives: [],
      ccm: opts.ccm,
      funcio: "",
      duplicitat: "A",
      include: false,
    };
    const cls = classifyDenominacio(row.denominacio, rules);
    if (cls.kind === "no-tag") {
      return { ...base, kind: "no-tag", nota: cls.motiu };
    }
    if (cls.kind === "desconegut") {
      return { ...base, nota: "No s'ha reconegut l'equip: tria el codi." };
    }
    const { rule } = cls;
    const common: ProposedRow = {
      ...base,
      kind: "equip",
      codiEquip: rule.codi,
      confianca: rule.confianca,
      nota: rule.nota ?? "",
      alternatives: rule.alternatives ?? [],
      include: rule.confianca !== "revisar",
    };
    if (rule.especial === "ccm") {
      return {
        ...common,
        ccm: "0",
        funcio: ccmNumberFromText(row.denominacio),
        duplicitat: "A",
      };
    }
    const key = `${rule.codi}|${groupKey(row.denominacio)}`;
    if (opts.agrupaBessones && rule.bessones && groups.has(key)) {
      const g = groups.get(key)!;
      g.count += 1;
      return {
        ...common,
        funcio: String(g.funcio).padStart(2, "0"),
        duplicitat: String.fromCharCode(64 + Math.min(g.count, 26)),
      };
    }
    const start =
      counters.get(rule.codi) ??
      nextFreeFunction(
        opts.existingTags,
        opts.codiInstallacio,
        rule.codi,
        opts.ccm,
      );
    counters.set(rule.codi, start + 1);
    if (opts.agrupaBessones && rule.bessones) {
      groups.set(key, { funcio: start, count: 1 });
    }
    return {
      ...common,
      funcio: start <= 99 ? String(start).padStart(2, "0") : "",
    };
  });
}

export interface EvaluateContext {
  codiInstallacio: string;
  projectTags: Set<string>;
  rosmimanTags: Set<string>;
  /** Codis d'equip (majúscules) que existeixen a la Taula Master */
  masterCodes: Set<string>;
}

function validateFields(r: ProposedRow, inst: string): string | null {
  if (!/^[A-Z0-9]{5}$/i.test(inst))
    return "Codi d'instal·lació invàlid (5 caràcters).";
  if (!/^\d$/.test(r.ccm)) return "CCM: 1 dígit (0-9).";
  if (!/^\d{1,2}$/.test(r.funcio)) return "Funció: 1-2 dígits (00-99).";
  if (!/^[A-Z]$/i.test(r.duplicitat)) return "Duplicitat: 1 lletra (A-Z).";
  return null;
}

export function evaluateRows(
  rows: ProposedRow[],
  ctx: EvaluateContext,
): Map<string, RowEvaluation> {
  const out = new Map<string, RowEvaluation>();
  const counts = new Map<string, number>();
  const tagOf = (r: ProposedRow) =>
    r.kind === "equip" && r.codiEquip && r.funcio !== ""
      ? buildTag(
          ctx.codiInstallacio,
          r.codiEquip,
          r.ccm,
          r.funcio,
          r.duplicitat,
        )
      : "";
  for (const r of rows) {
    const t = tagOf(r);
    if (t && r.include) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const r of rows) {
    if (r.kind === "no-tag") {
      out.set(r.id, { tag: "", status: "no-aplica", message: r.nota });
      continue;
    }
    if (!r.codiEquip) {
      out.set(r.id, {
        tag: "",
        status: "sense-codi",
        message: "Cal triar un codi d'equip.",
      });
      continue;
    }
    if (!ctx.masterCodes.has(r.codiEquip.toUpperCase())) {
      out.set(r.id, {
        tag: "",
        status: "sense-equip-master",
        message: `El codi ${r.codiEquip} no existeix a la Taula Master.`,
      });
      continue;
    }
    const err = validateFields(r, ctx.codiInstallacio);
    const tag = tagOf(r);
    if (err || !tag) {
      out.set(r.id, {
        tag,
        status: "invalid",
        message: err ?? "Falta la funció.",
      });
      continue;
    }
    if (ctx.projectTags.has(tag)) {
      out.set(r.id, {
        tag,
        status: "existeix-projecte",
        message: "Ja existeix en aquest projecte.",
      });
    } else if (ctx.rosmimanTags.has(tag)) {
      out.set(r.id, {
        tag,
        status: "existeix-rosmiman",
        message: "Ja existeix al llistat Rosmiman.",
      });
    } else if ((counts.get(tag) ?? 0) > 1) {
      out.set(r.id, {
        tag,
        status: "duplicat-importacio",
        message: "Repetit dins la importació.",
      });
    } else {
      out.set(r.id, { tag, status: "ok", message: "" });
    }
  }
  return out;
}
