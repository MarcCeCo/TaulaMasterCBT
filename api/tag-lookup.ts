// api/tag-lookup.ts
// Endpoint per verificar disponibilitat exacta de TAGs Rosmiman i proposar el primer lliure.
//
// POST /api/tag-lookup
// Body: { codiInstallacio: string, codiEquip: string, ccm: number, funcio: number }
// Retorna: { disponible: boolean, tagProposat: string, tagsExistents: string[], primerLliure: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";

function buildTag(codiInstallacio: string, codiEquip: string, ccm: number, funcio: number, duplicitat: string): string {
  return `${codiInstallacio}_${codiEquip}_${ccm}${String(funcio).padStart(2, "0")}${duplicitat}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ error: "Mètode no permès" }); return; }

  const supaUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supaUrl || !supaKey) {
    res.status(500).json({ error: "Falta configuració Supabase" }); return;
  }

  const { codiInstallacio, codiEquip, ccm, funcio } = req.body as {
    codiInstallacio: string;
    codiEquip: string;
    ccm: number;
    funcio: number;
  };

  if (!codiInstallacio || !codiEquip || ccm == null || funcio == null) {
    res.status(400).json({ error: "Falten paràmetres: codiInstallacio, codiEquip, ccm, funcio" }); return;
  }

  // Prefix del TAG sense la duplicitat: ex "ED001_BCS0_101"
  const prefix = `${codiInstallacio}_${codiEquip}_${ccm}${String(funcio).padStart(2, "0")}`;

  try {
    // Cercar tots els TAGs que comencen per aquest prefix a Rosmiman (cerca exacta per prefix)
    const rosmimanRes = await fetch(
      `${supaUrl}/rest/v1/rosmiman_equips?select=tag&tag=like.${encodeURIComponent(prefix + "%")}`,
      { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }
    );
    const rosmimanRows = await rosmimanRes.json() as { tag: string }[];
    const tagsRosmiman = new Set(rosmimanRows.map(r => r.tag));

    // Cercar també als projecte_tags
    const projecteRes = await fetch(
      `${supaUrl}/rest/v1/projecte_tags?select=tag_complet&tag_complet=like.${encodeURIComponent(prefix + "%")}`,
      { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }
    );
    const projecteRows = await projecteRes.json() as { tag_complet: string }[];
    const tagsProjecte = new Set(projecteRows.map(r => r.tag_complet));

    const tagsExistents = [...new Set([...tagsRosmiman, ...tagsProjecte])].sort();

    // Trobar primera duplicitat lliure (A-Z)
    let primerLliure = "";
    for (const lletra of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const tagCandidat = buildTag(codiInstallacio, codiEquip, ccm, funcio, lletra);
      if (!tagsRosmiman.has(tagCandidat) && !tagsProjecte.has(tagCandidat)) {
        primerLliure = tagCandidat;
        break;
      }
    }

    const tagA = buildTag(codiInstallacio, codiEquip, ccm, funcio, "A");

    res.status(200).json({
      prefix,
      disponible: !tagsRosmiman.has(tagA) && !tagsProjecte.has(tagA),
      tagProposat: primerLliure,
      tagsExistents,
      totalExistents: tagsExistents.length,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
}
