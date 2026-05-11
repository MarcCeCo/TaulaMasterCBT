/**
 * useDebounce — retarda l'actualització d'un valor fins que l'usuari
 * deixa d'escriure durant `ms` mil·lisegons.
 *
 * Extret de EquipmentsTable per ser reutilitzable a qualsevol component.
 */
import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, ms = 200): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return dv;
}
