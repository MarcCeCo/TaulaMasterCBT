/**
 * Extreu un missatge llegible d'un error capturat amb try/catch.
 * Substitueix el patró `catch (e: any) { e.message }`, que no és segur
 * perquè en JavaScript es pot llançar qualsevol valor (no només Error).
 */
export function errorMessage(
  e: unknown,
  fallback = "Error desconegut",
): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}
