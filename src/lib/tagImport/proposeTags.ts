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

  // Tags indicats a la plantilla: es reserven perquè la numeració automàtica
  // no hi col·lisioni.
  const presetTags = rows
    .filter((r) => r.presetCodi && r.presetFuncio)
    .map((r) =>
      buildTag(
        opts.codiInstallacio,
        r.presetCodi!,
        r.presetCcm ?? opts.ccm,
        r.presetFuncio!,
        r.presetDuplicitat ?? "A",
      ),
    );
  const known = [...opts.existingTags, ...presetTags];

  const empty = (row: SourceRow): ProposedRow => ({
    ...row,
    kind: "desconegut",
    codiEquip: "",
    confianca: null,
    nota: "",
    alternatives: [],
    ccm: row.presetCcm ?? opts.ccm,
    funcio: "",
    duplicitat: "A",
    include: false,
  });

  const propose = (row: SourceRow): ProposedRow => {
    const base = empty(row);
    // Codi indicat explícitament a la plantilla: té prioritat sobre les regles
    if (row.presetCodi) {
      const ccm = row.presetCcm ?? opts.ccm;
      const key = `${row.presetCodi}|${ccm}`;
      let funcio = row.presetFuncio ?? "";
      if (!/^\d$/.test(ccm)) {
        funcio = "";
      } else if (!funcio) {
        const start =
          counters.get(key) ??
          nextFreeFunction(known, opts.codiInstallacio, row.presetCodi, ccm);
        counters.set(key, start + 1);
        funcio = start <= 99 ? String(start).padStart(2, "0") : "";
      } else {
        funcio = funcio.padStart(2, "0");
      }
      return {
        ...base,
        kind: "equip",
        codiEquip: row.presetCodi,
        confianca: "alta",
        nota: "Codi indicat a la plantilla.",
        ccm,
        funcio,
        duplicitat: row.presetDuplicitat ?? "A",
        include: true,
      };
    }
    const cls = classifyDenominacio(row.denominacio, rules);
    if (cls.kind === "no-tag") {
      return { ...base, kind: "no-tag", nota: cls.motiu };
    }
    if (cls.kind === "desconegut") {
      return { ...base, nota: "No s'ha reconegut l'equip: tria el codi." };
    }
    const { rule } = cls;
    const ccm = row.presetCcm ?? opts.ccm;
    const common: ProposedRow = {
      ...base,
      kind: "equip",
      codiEquip: rule.codi,
      confianca: rule.confianca,
      nota: rule.nota ?? "",
      alternatives: rule.alternatives ?? [],
      ccm,
      include: rule.confianca !== "revisar",
    };
    if (!/^\d$/.test(ccm)) {
      return { ...common, funcio: "", include: false };
    }
    if (rule.especial === "ccm") {
      return {
        ...common,
        ccm: "0",
        funcio: row.presetFuncio ?? ccmNumberFromText(row.denominacio),
        duplicitat: row.presetDuplicitat ?? "A",
      };
    }
    const gkey = `${rule.codi}|${ccm}|${groupKey(row.denominacio)}`;
    if (opts.agrupaBessones && rule.bessones && groups.has(gkey)) {
      const g = groups.get(gkey)!;
      g.count += 1;
      return {
        ...common,
        funcio: String(g.funcio).padStart(2, "0"),
        duplicitat:
          row.presetDuplicitat ??
          String.fromCharCode(64 + Math.min(g.count, 26)),
      };
    }
    const ckey = `${rule.codi}|${ccm}`;
    const start =
      row.presetFuncio !== undefined
        ? parseInt(row.presetFuncio, 10)
        : (counters.get(ckey) ??
          nextFreeFunction(known, opts.codiInstallacio, rule.codi, ccm));
    if (row.presetFuncio === undefined) counters.set(ckey, start + 1);
    if (opts.agrupaBessones && rule.bessones) {
      groups.set(gkey, { funcio: start, count: 1 });
    }
    return {
      ...common,
      funcio: start <= 99 ? String(start).padStart(2, "0") : "",
      duplicitat: row.presetDuplicitat ?? "A",
    };
  };

  // La numeració segueix l'ordre de procés (si n'hi ha); si no, l'ordre del fitxer.
  const order = rows
    .map((_, i) => i)
    .sort((a, b) => {
      const oa = rows[a].ordre;
      const ob = rows[b].ordre;
      if (oa !== undefined && ob !== undefined && oa !== ob) return oa - ob;
      if (oa !== undefined && ob === undefined) return -1;
      if (oa === undefined && ob !== undefined) return 1;
      return a - b;
    });
  const result: ProposedRow[] = new Array(rows.length);
  for (const i of order)
    result[i] = { ...propose(rows[i]), ordre: rows[i].ordre };
  return result;
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
    if (r.fromTemplate) {
      const falta: string[] = [];
      if (r.ordre === undefined) falta.push("Ordre procés");
      if (!/^\d$/.test(r.ccm)) falta.push("CCM");
      if (falta.length > 0) {
        out.set(r.id, {
          tag: "",
          status: "falta-dades",
          message: `Falta ${falta.join(" i ")} (obligatori a la plantilla).`,
        });
        continue;
      }
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
