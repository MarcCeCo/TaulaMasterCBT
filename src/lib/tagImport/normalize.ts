// src/lib/tagImport/normalize.ts
// Normalització de text per comparar denominacions i capçaleres:
// minúscules, sense accents ni punts volats i amb espais col·lapsats.

export function norm(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[·.ºª°]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clau per agrupar unitats iguals: sense números, "reserva" ni L1/L2/nº3. */
export function groupKey(value: string): string {
  return norm(value)
    .replace(/\(?reserva\)?/g, "")
    .replace(/\b[nl]?\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNumeric(value: string): boolean {
  return /^[\d.,\s%+-]+$/.test(value.trim()) && /\d/.test(value);
}
