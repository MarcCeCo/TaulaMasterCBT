// src/components/cbt/PublicLinksDialog.tsx
//
// Gestió d'enllaços públics del Visor 3D d'una instal·lació (només administradors).
// Permet crear un enllaç (amb caducitat), copiar-lo i revocar els existents.
// Clicant un enllaç de la llista es desplega la seva URL. Revocar-lo n'esborra
// la fila de la base de dades. L'enllaç només mostra la vista «Estat actual».

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Link2,
  Loader2,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errors";
import {
  creaEnllacPublic,
  estatEnllac,
  llistaEnllacosPublics,
  revocaEnllacPublic,
  urlEnllacPublic,
  type EnllacPublic,
} from "@/lib/publicLinks";

const CADUCITATS: { valor: string; text: string }[] = [
  { valor: "7", text: "7 dies" },
  { valor: "30", text: "30 dies" },
  { valor: "90", text: "90 dies" },
  { valor: "365", text: "1 any" },
  { valor: "0", text: "Sense caducitat" },
];

const fmtData = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ca-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export function PublicLinksDialog({
  installacioId,
  installacioNom,
  onClose,
}: {
  installacioId: string;
  installacioNom: string;
  onClose: () => void;
}) {
  const [enllacos, setEnllacos] = useState<EnllacPublic[]>([]);
  const [carregant, setCarregant] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [etiqueta, setEtiqueta] = useState("");
  const [caducitat, setCaducitat] = useState("30");
  const [creant, setCreant] = useState(false);
  const [nouUrl, setNouUrl] = useState<string | null>(null);
  const [copiat, setCopiat] = useState(false);
  const [revocant, setRevocant] = useState<string | null>(null);
  const [obert, setObert] = useState<string | null>(null);

  const carrega = useCallback(async () => {
    setError(null);
    try {
      setEnllacos(await llistaEnllacosPublics(installacioId));
    } catch (e) {
      setError(errorMessage(e, "No s'han pogut carregar els enllaços."));
    } finally {
      setCarregant(false);
    }
  }, [installacioId]);

  useEffect(() => {
    void carrega();
  }, [carrega]);

  async function crea() {
    setCreant(true);
    setCopiat(false);
    try {
      const dies = Number(caducitat);
      const r = await creaEnllacPublic({
        installacioId,
        etiqueta: etiqueta.trim(),
        dies: dies > 0 ? dies : null,
      });
      setNouUrl(urlEnllacPublic(r.token));
      setEtiqueta("");
      await carrega();
    } catch (e) {
      toast.error(errorMessage(e, "No s'ha pogut crear l'enllaç."));
    } finally {
      setCreant(false);
    }
  }

  async function copia(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiat(true);
      toast.success("Enllaç copiat");
    } catch {
      toast.error("No s'ha pogut copiar. Selecciona'l i copia'l a mà.");
    }
  }

  async function revoca(id: string) {
    setRevocant(id);
    try {
      await revocaEnllacPublic(id);
      toast.success("Enllaç revocat i eliminat.");
      if (obert === id) setObert(null);
      await carrega();
    } catch (e) {
      toast.error(errorMessage(e, "No s'ha pogut revocar l'enllaç."));
    } finally {
      setRevocant(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-[#0099A8]" />
            Enllaç públic — {installacioNom}
          </DialogTitle>
          <DialogDescription>
            Qualsevol persona amb l'enllaç podrà veure la vista «Estat actual»
            del model en només lectura, sense iniciar sessió. Comparteix-lo
            només amb qui calgui.
          </DialogDescription>
        </DialogHeader>

        {/* Crear */}
        <div className="rounded-lg border border-slate-200 p-3 space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="pl-etiqueta" className="text-xs">
                Per a qui és (opcional)
              </Label>
              <Input
                id="pl-etiqueta"
                value={etiqueta}
                maxLength={100}
                placeholder="p. ex. Empresa X — projecte de reforma"
                onChange={(e) => setEtiqueta(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-caducitat" className="text-xs">
                Caduca en
              </Label>
              <select
                id="pl-caducitat"
                value={caducitat}
                onChange={(e) => setCaducitat(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
              >
                {CADUCITATS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.text}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-[#0099A8] hover:bg-[#006E7A] text-white"
            onClick={crea}
            disabled={creant}
          >
            {creant ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4 mr-1.5" />
            )}
            Crear enllaç públic
          </Button>

          {nouUrl && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2.5 space-y-1.5">
              <p className="text-xs font-semibold text-emerald-800">
                Enllaç creat. També el trobaràs a la llista de sota.
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={nouUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs bg-white"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copia(nouUrl)}
                  className="shrink-0"
                >
                  {copiat ? (
                    <Check className="h-4 w-4 mr-1.5" />
                  ) : (
                    <Copy className="h-4 w-4 mr-1.5" />
                  )}
                  {copiat ? "Copiat" : "Copiar"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Llista */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Enllaços d'aquesta instal·lació
          </p>
          {carregant ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-[#0099A8]" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : enllacos.length === 0 ? (
            <p className="text-sm text-slate-400 italic">
              Encara no n'hi ha cap.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {enllacos.map((e) => {
                const estat = estatEnllac(e);
                const url = e.token ? urlEnllacPublic(e.token) : null;
                const desplegat = obert === e.id;
                const clicable = estat === "actiu";
                return (
                  <li key={e.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "min-w-0 flex-1",
                          clicable && "cursor-pointer",
                        )}
                        onClick={() =>
                          clicable && setObert(desplegat ? null : e.id)
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                              estat === "actiu" &&
                                "bg-emerald-100 text-emerald-700",
                              estat === "caducat" &&
                                "bg-amber-100 text-amber-700",
                              estat === "revocat" &&
                                "bg-slate-100 text-slate-500",
                            )}
                          >
                            {estat}
                          </span>
                          <span className="text-sm text-slate-700 truncate">
                            {e.etiqueta || "Sense etiqueta"}
                          </span>
                          {clicable && (
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 text-slate-400 transition-transform",
                                desplegat && "rotate-180",
                              )}
                            />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Creat {fmtData(e.created_at)}
                          {e.created_by_email
                            ? ` per ${e.created_by_email}`
                            : ""}
                          {" · "}
                          {e.expires_at
                            ? `caduca ${fmtData(e.expires_at)}`
                            : "sense caducitat"}
                          {" · "}
                          {e.access_count}{" "}
                          {e.access_count === 1 ? "accés" : "accessos"}
                          {e.last_access_at
                            ? ` (últim ${fmtData(e.last_access_at)})`
                            : ""}
                        </p>
                      </div>
                      {(estat === "actiu" || estat === "caducat") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                          disabled={revocant === e.id}
                          onClick={() => revoca(e.id)}
                        >
                          {revocant === e.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          {estat === "actiu" ? "Revocar" : "Eliminar"}
                        </Button>
                      )}
                    </div>
                    {desplegat && (
                      <div className="mt-2">
                        {url ? (
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={url}
                              onFocus={(ev) => ev.currentTarget.select()}
                              className="font-mono text-xs bg-white"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copia(url)}
                              className="shrink-0"
                            >
                              <Copy className="h-4 w-4 mr-1.5" />
                              Copiar
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic">
                            Aquest enllaç es va crear abans de poder desar-ne la
                            URL, així que no es pot mostrar. Revoca'l i crea'n
                            un de nou.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
