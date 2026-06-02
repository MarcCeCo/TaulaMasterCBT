// api/bim-manual-text.ts
// Vercel Edge Function — extreu i retorna el text del Manual BIM (PDF) en format
// pla perquè /api/groq-chat el pugui incloure al context de l'assistent.
//
// El PDF es llegeix des de la URL pública del propi projecte Vercel.
// No requereix autenticació ja que el PDF és a /public/docs/.
//
// Endpoint: GET /api/bim-manual-text
// Retorna:  { text: string, cachedAt: number }
// ─────────────────────────────────────────────────────────────────────────────

export const config = { runtime: "edge" };

// ─── Cache en memòria (dura mentre la Edge Function estigui "calenta") ────────
// A Vercel Edge, cada instància té la seva pròpia memòria, però és suficient
// per evitar re-descarregar el PDF en cada crida dins la mateixa instància.

let cachedText: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // Serveix des de cache si és fresc
  if (cachedText && Date.now() - cachedAt < CACHE_TTL_MS) {
    return new Response(
      JSON.stringify({ text: cachedText, cachedAt }),
      { status: 200, headers }
    );
  }

  // URL base del deployment actual (Vercel injecta VERCEL_URL)
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:5173";

  try {
    // Descarrega el PDF des de la carpeta pública
    const pdfRes = await fetch(`${baseUrl}/docs/CBT_MANUAL-BIM.pdf`);
    if (!pdfRes.ok) {
      return new Response(
        JSON.stringify({ error: `No s'ha pogut llegir el PDF: ${pdfRes.status}` }),
        { status: 502, headers }
      );
    }

    const pdfBuffer = await pdfRes.arrayBuffer();

    // Extracció de text del PDF amb l'API pdf.js (disponible a Edge via WebAssembly)
    // Usem una extracció lleugera: busquem strings de text entre parèntesis BT/ET
    // del flux PDF sense dependències externes (compatible amb Edge runtime).
    const text = extractTextFromPdf(new Uint8Array(pdfBuffer));

    cachedText = text;
    cachedAt   = Date.now();

    return new Response(
      JSON.stringify({ text, cachedAt }),
      { status: 200, headers }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers }
    );
  }
}

// ─── Extracció de text de PDF (compatible Edge — sense Node.js) ───────────────
//
// Llegeix els operadors de text BT...ET del flux PDF i extrau les cadenes
// dels operadors Tj, TJ, ' i ". No és perfecte però dona el text principal
// del document sense necessitar cap llibreria externa.

function extractTextFromPdf(bytes: Uint8Array): string {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);

  const lines: string[] = [];
  let i = 0;

  // Processa tots els blocs de text BT...ET
  while (i < raw.length) {
    const btIdx = raw.indexOf("BT", i);
    if (btIdx === -1) break;
    const etIdx = raw.indexOf("ET", btIdx + 2);
    if (etIdx === -1) break;

    const block = raw.slice(btIdx + 2, etIdx);
    extractBlockText(block, lines);
    i = etIdx + 2;
  }

  // Neteja i retorna (limitat a ~80.000 cars per no inflar el context de Groq)
  const full = lines
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return full.slice(0, 80_000);
}

function extractBlockText(block: string, out: string[]): void {
  // Tj: (text)Tj
  const tjRe = /\(([^)]*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tjRe.exec(block)) !== null) {
    const t = decodePdfString(m[1]);
    if (t.trim()) out.push(t);
  }

  // TJ: [(text) offset (text)] TJ
  const tjArrRe = /\[([^\]]*)\]\s*TJ/g;
  while ((m = tjArrRe.exec(block)) !== null) {
    const inner = m[1];
    const strRe = /\(([^)]*)\)/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRe.exec(inner)) !== null) {
      const t = decodePdfString(sm[1]);
      if (t.trim()) out.push(t);
    }
  }

  // ' i " (move to next line + show string)
  const quoteRe = /\(([^)]*)\)\s*['\"]/g;
  while ((m = quoteRe.exec(block)) !== null) {
    const t = decodePdfString(m[1]);
    if (t.trim()) out.push(t);
  }
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    // Escapes octal \ddd
    .replace(/\\(\d{3})/g, (_, oct) =>
      String.fromCharCode(parseInt(oct, 8))
    );
}
