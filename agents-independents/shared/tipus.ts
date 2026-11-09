/* eslint-disable @typescript-eslint/no-explicit-any --
   Únic lloc on s'accepta `any` als agents: respostes JSON crues de les APIs
   d'Autodesk (APS/ACC), que no porten tipus. Es validen on es fan servir. */
export type JsonAny = any;

/** Extreu un missatge llegible d'un error capturat amb try/catch. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}
