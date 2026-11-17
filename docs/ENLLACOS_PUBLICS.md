# Enllaços públics del Visor 3D

## Canvis (vista «Estat actual», revocació i URL visible)

- L'enllaç públic només mostra la vista 3D **«Estat actual»** (sense selector de vistes ni plànols).
  Si el model no té aquesta vista, el visor públic mostra un error.
- **Revocar** un enllaç n'esborra la fila de `visor_public_links` (ja no apareix a la llista).
- A la llista, clicant un enllaç actiu es mostra la seva **URL** i es pot copiar.

## SQL a executar a Supabase (un cop, SQL Editor)

```sql
alter table public.visor_public_links add column if not exists token text;
```

Els enllaços creats abans d'aquest canvi no tenen `token`: no se'n pot mostrar la URL
(només n'hi havia el hash). Cal revocar-los i crear-ne de nous.

## Seguretat

- La taula té RLS sense polítiques: només s'hi arriba amb la service role (funcions de Vercel).
- El token es desa en clar per poder tornar a mostrar la URL; qui tingui accés a la taula pot reconstruir els enllaços.
- La restricció a «Estat actual» és a la interfície. El token d'Autodesk de l'enllaç (`viewables:read`) dona accés a tot el model: un usuari amb coneixements tècnics podria demanar-ne altres vistes. Per bloquejar-ho al servidor caldria publicar un model separat només amb aquesta vista.
