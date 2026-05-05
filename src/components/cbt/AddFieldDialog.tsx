import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldMeta } from "@/lib/fields";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  groups: string[];
  disciplines: string[];
  editing?: FieldMeta | null;
  onSubmit: (f: FieldMeta) => void;
  existsCol: (col: string) => boolean;
}

const TYPES = ["Text", "Integer", "Number", "Boolean", "Date", "List"];

function generateCbtName(name: string): string {
  return "CBT_" + name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9\s_]/g, "").replace(/\s+/g, "_");
}

export function AddFieldDialog({ open, onOpenChange, groups, disciplines, editing, onSubmit, existsCol }: Props) {
  const [code, setCode] = useState("");         // Codi Rosmiman (clau interna)
  const [name, setName] = useState("");
  const [isCls, setIsCls] = useState(false);
  // Revit
  const [type, setType] = useState<string>("Text");
  const [discipline, setDiscipline] = useState("");
  const [disciplineCustom, setDisciplineCustom] = useState("");
  const [activeRevit, setActiveRevit] = useState<"Y" | "N">("Y");
  const [agrupCbt, setAgrupCbt] = useState<string>("");  // group = Agrupació CBT (Revit)
  const [agrupCbtCustom, setAgrupCbtCustom] = useState("");
  // Rosmiman
  const [taulaAssoc, setTaulaAssoc] = useState("");
  const [tipusDada, setTipusDada] = useState("");        // category = Tipus dada

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCode(editing.code ?? editing.col);
      setName(editing.name ?? "");
      const cls = !editing.type && !editing.code && !editing.category && !editing.group && !editing.cbt_name && !editing.discipline;
      setIsCls(cls);
      setType(editing.type ?? "Text");
      setDiscipline(editing.discipline ?? ""); setDisciplineCustom("");
      setActiveRevit(editing.active ?? "Y");
      setAgrupCbt(editing.group ?? ""); setAgrupCbtCustom("");
      setTaulaAssoc(editing.taulaAssoc ?? "");
      setTipusDada(editing.category ?? "");
    } else {
      setCode(""); setName(""); setIsCls(false); setType("Text");
      setDiscipline(""); setDisciplineCustom(""); setActiveRevit("Y");
      setAgrupCbt(""); setAgrupCbtCustom("");
      setTaulaAssoc(""); setTipusDada("");
    }
  }, [open, editing]);

  const cbtPreview = !isCls && name ? generateCbtName(name) : "";
  const finalAgrupCbt = agrupCbt === "__new__" ? agrupCbtCustom.trim() : agrupCbt;
  const finalDiscipline = discipline === "__new__" ? disciplineCustom.trim() : discipline;

  const submit = () => {
    const C = code.trim().toUpperCase();
    if (!C) return toast.error("El codi és obligatori");
    if (C.length > 20) return toast.error("El codi no pot superar els 20 caràcters");
    if (!/^[A-Z0-9_]+$/.test(C)) return toast.error("Codi no vàlid (només lletres, números i _)");
    if (!editing && existsCol(C)) return toast.error("Aquest codi ja existeix");
    if (!name.trim()) return toast.error("El nom és obligatori");

    const f: FieldMeta = isCls
      ? { col: C, name: name.trim(), cbt_name: null, type: null, unit: null, code: null, category: null, group: null, active: "Y", discipline: null, taulaAssoc: null, order: editing?.order ?? Date.now(), scope: "global" }
      : {
          col: C,
          name: name.trim(),
          cbt_name: cbtPreview || null,
          type,
          unit: null,
          code: C,
          category: tipusDada.trim() || null,
          group: finalAgrupCbt || null,
          active: activeRevit,
          discipline: finalDiscipline || null,
          taulaAssoc: taulaAssoc.trim() || null,
          order: editing?.order ?? Date.now(),
          scope: "global",
        };
    onSubmit(f);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edita camp" : "Nou camp"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {/* Codi + Nom — comuns */}
          <div className="space-y-1.5">
            <Label>Codi *</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
              maxLength={20}
              disabled={!!editing}
              className="font-mono uppercase"
              placeholder="ex. POTENCIA_NOMINAL"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nom *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Potència nominal" />
          </div>

          {/* Toggle classificador */}
          <div className="col-span-2 flex items-center gap-3 p-2 rounded-md bg-muted/40">
            <Switch checked={isCls} onCheckedChange={setIsCls} id="iscls" />
            <Label htmlFor="iscls" className="cursor-pointer">Camp classificador (capçalera de secció)</Label>
          </div>

          {!isCls && (
            <>
              {/* REVIT */}
              <div className="col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#0099A8]" />
                  <span className="text-xs font-semibold text-[#0099A8] uppercase tracking-wide">Paràmetre Revit (.txt)</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pl-5 border-l-2 border-[#0099A8]/30">
                  <div className="col-span-2 space-y-1.5">
                    <Label>Nom CBT (auto-generat)</Label>
                    <Input value={cbtPreview} readOnly className="bg-muted/50 font-mono text-xs" placeholder="S'omplirà automàticament" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Format paràmetre *</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Disciplina</Label>
                    <Select value={discipline} onValueChange={setDiscipline}>
                      <SelectTrigger><SelectValue placeholder="Selecciona disciplina…" /></SelectTrigger>
                      <SelectContent>
                        {disciplines.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        <SelectItem value="__new__">+ Nova disciplina…</SelectItem>
                      </SelectContent>
                    </Select>
                    {discipline === "__new__" && <Input placeholder="Nova disciplina" value={disciplineCustom} onChange={(e) => setDisciplineCustom(e.target.value)} autoFocus />}
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Agrupació CBT</Label>
                    <Select value={agrupCbt} onValueChange={setAgrupCbt}>
                      <SelectTrigger><SelectValue placeholder="Selecciona agrupació…" /></SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                        <SelectItem value="__new__">+ Nova agrupació…</SelectItem>
                      </SelectContent>
                    </Select>
                    {agrupCbt === "__new__" && <Input placeholder="Nom de la nova agrupació" value={agrupCbtCustom} onChange={(e) => setAgrupCbtCustom(e.target.value)} autoFocus />}
                  </div>
                  <div className="col-span-2 flex items-center gap-3 p-2 rounded-md bg-[#0099A8]/5">
                    <Switch checked={activeRevit === "Y"} onCheckedChange={(v) => setActiveRevit(v ? "Y" : "N")} id="activerevit" />
                    <Label htmlFor="activerevit" className="cursor-pointer">Instància Revit activa (Y / N)</Label>
                  </div>
                </div>
              </div>

              {/* ROSMIMAN */}
              <div className="col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-violet-400" />
                  <span className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Camp Rosmiman</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pl-5 border-l-2 border-violet-200">
                  <div className="space-y-1.5">
                    <Label>Tipus dada</Label>
                    <Input value={tipusDada} onChange={(e) => setTipusDada(e.target.value)} placeholder="ex. Alfanumèric, Numèric…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Taula associada</Label>
                    <Input value={taulaAssoc} onChange={(e) => setTaulaAssoc(e.target.value)} placeholder="(opcional)" />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel·la</Button>
          <Button onClick={submit}>{editing ? "Desa" : "Crea"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
