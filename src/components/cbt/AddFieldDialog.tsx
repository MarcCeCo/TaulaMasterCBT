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

// Tipus dada: 0=Text, 1=Numèrica, 2=TaulaAssociada, 3=Data
const TIPUS_DADA_OPTIONS = [
  { value: "0", label: "0 – Text" },
  { value: "1", label: "1 – Numèrica" },
  { value: "2", label: "2 – Taula Associada" },
  { value: "3", label: "3 – Data" },
];

const TYPES = ["Text", "Integer", "Number", "Boolean", "Date", "List"];

function generateCbtName(name: string): string {
  return "CBT_" + name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9\s_]/g, "").replace(/\s+/g, "_");
}

export function AddFieldDialog({ open, onOpenChange, groups, disciplines, editing, onSubmit, existsCol }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isCls, setIsCls] = useState(false);
  // Revit
  const [type, setType] = useState<string>("Text");
  const [discipline, setDiscipline] = useState("");
  const [disciplineCustom, setDisciplineCustom] = useState("");
  const [activeRevit, setActiveRevit] = useState<"Y" | "N">("Y");
  const [agrupRevit, setAgrupRevit] = useState<string>("");
  const [agrupRevitCustom, setAgrupRevitCustom] = useState("");
  const [grupTxt, setGrupTxt] = useState("");
  // Rosmiman
  const [taulaAssoc, setTaulaAssoc] = useState("");
  const [tipusDada, setTipusDada] = useState("");

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
      setAgrupRevit(editing.group ?? ""); setAgrupRevitCustom("");
      setGrupTxt(editing.unit ?? "");
      setTaulaAssoc(editing.taulaAssoc ?? "");
      setTipusDada(editing.category ?? "");
    } else {
      setCode(""); setName(""); setIsCls(false); setType("Text");
      setDiscipline(""); setDisciplineCustom(""); setActiveRevit("Y");
      setAgrupRevit(""); setAgrupRevitCustom("");
      setGrupTxt("");
      setTaulaAssoc(""); setTipusDada("");
    }
  }, [open, editing]);

  const cbtPreview = !isCls && name ? generateCbtName(name) : "";
  const finalAgrupRevit = agrupRevit === "__new__" ? agrupRevitCustom.trim() : agrupRevit;
  const finalDiscipline = discipline === "__new__" ? disciplineCustom.trim() : discipline;
  const taulaAssocRequired = tipusDada === "2";

  const submit = () => {
    const C = code.trim().toUpperCase();
    if (C && C.length > 20) return toast.error("El codi no pot superar els 20 caràcters");
    if (C && !/^[A-Z0-9_]+$/.test(C)) return toast.error("Codi no vàlid (només lletres, números i _)");
    if (C && !editing && existsCol(C)) return toast.error("Aquest codi ja existeix");
    if (!name.trim()) return toast.error("El nom és obligatori");
    if (taulaAssocRequired && !taulaAssoc.trim()) return toast.error("La taula associada és obligatòria quan el tipus dada és 'Taula Associada'");

    // Per als camps sense codi, generem una clau interna basada en el nom
    const colKey = C || ("CAMP_" + name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "_").slice(0, 16) + "_" + Date.now().toString().slice(-4));

    const f: FieldMeta = isCls
      ? { col: colKey, name: name.trim(), cbt_name: null, type: null, unit: null, code: null, category: null, group: null, active: "Y", discipline: null, taulaAssoc: null, order: editing?.order ?? Date.now(), scope: "global" }
      : {
          col: colKey,
          name: name.trim(),
          cbt_name: cbtPreview || null,
          type,
          unit: grupTxt.trim() || null,
          code: C || null,
          category: tipusDada.trim() || null,
          group: finalAgrupRevit || null,
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
          <div className="space-y-1.5">
            <Label>Codi <span className="text-muted-foreground text-xs">(opcional, màx 20)</span></Label>
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
                  <div className="space-y-1.5">
                    <Label>Agrupació Revit</Label>
                    <Select value={agrupRevit} onValueChange={setAgrupRevit}>
                      <SelectTrigger><SelectValue placeholder="Selecciona agrupació…" /></SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                        <SelectItem value="__new__">+ Nova agrupació…</SelectItem>
                      </SelectContent>
                    </Select>
                    {agrupRevit === "__new__" && <Input placeholder="Nom de la nova agrupació" value={agrupRevitCustom} onChange={(e) => setAgrupRevitCustom(e.target.value)} autoFocus />}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Grup .txt</Label>
                    <Input value={grupTxt} onChange={(e) => setGrupTxt(e.target.value)} placeholder="ex. Mecànica" />
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
                    <Select value={tipusDada} onValueChange={setTipusDada}>
                      <SelectTrigger><SelectValue placeholder="Selecciona tipus…" /></SelectTrigger>
                      <SelectContent>
                        {TIPUS_DADA_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      Taula associada{taulaAssocRequired && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Input
                      value={taulaAssoc}
                      onChange={(e) => setTaulaAssoc(e.target.value)}
                      placeholder={taulaAssocRequired ? "Obligatori per a Taula Associada" : "(opcional)"}
                      className={taulaAssocRequired && !taulaAssoc.trim() ? "border-destructive" : ""}
                    />
                    {taulaAssocRequired && !taulaAssoc.trim() && (
                      <p className="text-xs text-destructive">Obligatori quan el tipus dada és Taula Associada</p>
                    )}
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
