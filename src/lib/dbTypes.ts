/* eslint-disable @typescript-eslint/no-explicit-any --
   Aquest és l'ÚNIC lloc on s'accepta `any` per a dades externes sense tipus:
   - DbRow: fila JSON crua de Supabase/PostgREST (es valida als conversors).
   - SheetRow: fila d'un full Excel llegit amb xlsx.
   - ExternalObject: objectes de l'Autodesk Viewer (la llibreria no porta tipus).
   Així la resta del codi pot prohibir `any` sense soroll. */
export type DbRow = Record<string, any>;
export type SheetRow = Record<string, any>;
export type ExternalObject = any;
