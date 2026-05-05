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
  return name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9\s_]/g, "").replace(/\s+/g, "_");
}

export function AddFieldDialog({ open, onOpenChange, groups, disciplines, editing, onSubmit, existsCol }: Props) {
  const [col, setCol] = useState("");
  const [name, setName] = useState("");
  const [isCls, setIsCls] = useState(false);
  const [type, setType] = useState<string>("Text");
  const [discipline, setDiscipline] = useState("");
  const [disciplineCustom, setDisciplineCustom] = useState("");
  const [activeRevit, setActiveRevit] = useState<"Y" | "N">("Y");
  const [unit, setUnit] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("Paràmetre");
  const [group, setGroup] = useState<string>("");
  const [groupCustom, setGroupCustom] = useState("");
  const [taulaAssoc, setTaulaAssoc] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCol(editing.col); setName(editing.name ?? "");
      const cls = !editing.type && !editing.unit && !editing.code && !editing.category && !editing.group && !editing.cbt_name && !editing.discipline;
      setIsCls(cls); setType(editing.type ?? "Text");
      setDiscipline(editing.discipline ?? ""); setDisciplineCustom(""); setActiveRevit(editing.active ?? "Y");
      setUnit(editing.unit ?? ""); setCode(editing.code ?? ""); setCategory(editing.category ?? "Paràmetre");
      setGroup(editing.group ?? ""); setGroupCustom(""); setTaulaAssoc(editing.taulaAssoc ?? "");
    } else {
      setCol(""); setName(""); setIsCls(false); setType("Text");
      setDiscipline(""); setDisciplineCustom(""); setActiveRevit("Y");
      setUnit(""); setCode(""); setCategory("Paràmetre"); setGroup(""); setGroupCustom(""); setTaulaAssoc("");
    }
  }, [open, editing]);

  const cbtPreview = !isCls && name ? generateCbtName(name) : "";
  const finalGroup = group === "__new__" ? groupCustom.trim() : group;
  const finalDiscipline = discipline === "__new__" ? disciplineCustom.trim() : discipline;

  const submit = () => {
    const C = col.trim().toUpperCase();
    if (!C || C.length > 6) return toast.error("El codi ha de tenir entre 1 i 6 caràcters");
    if (!/^[A-Z0-9_]+$/.test(C)) return toast.error("Codi no vàlid");
    if (!editing && existsCol(C)) return toast.error("Aquest codi ja existeix");
    if (!name.trim()) return toast.error("El nom és obligatori");

    const f: FieldMeta = isCls
      ? { col: C, name: name.trim(), cbt_name: null, type: null, unit: null, code: null, category: null, group: null, active: "Y", discipline: null, taulaAssoc: null, order: editing?.order ?? Date.now(), scope: "global" }
      : { col: C, name: name.trim(), cbt_name: cbtPreview || null, type, unit: unit.trim() || null, code: code.trim() || null, category: category.trim() || "Paràmetre", group: finalGroup || null, active: activeRevit, discipline: finalDiscipline || null, taulaAssoc: taulaAssoc.trim() || null, order: editing?.order ?? Date.now(), scope: "global" };
    onSubmit(f);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edita camp" : "Nou camp"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Codi (col) *</Label>
            <Input value={col} onChange={(e) => setCol(e.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={6} disabled={!!editing} className="font-mono uppercase" placeholder="ex. POTNOM" />
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
              <div className="col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-[#0099A8]" />
                  <span className="text-xs font-semibold text-[#0099A8] uppercase tracking-wide">Configuració paràmetre Revit (.txt)</span>
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
                    <Label>Disciplina paràmetre</Label>
                    <Select value={discipline} onValueChange={setDiscipline}>
                      <SelectTrigger><SelectValue placeholder="Selecciona disciplina…" /></SelectTrigger>
                      <SelectContent>
                        {disciplines.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        <SelectItem value="__new__">+ Nova disciplina…</SelectItem>
                      </SelectContent>
                    </Select>
                    {discipline === "__new__" && <Input placeholder="Nova disciplina" value={disciplineCustom} onChange={(e) => setDisciplineCustom(e.target.value)} autoFocus />}
                  </div>
                  <div className="col-span-2 flex items-center gap-3 p-2 rounded-md bg-[#0099A8]/5">
                    <Switch checked={activeRevit === "Y"} onCheckedChange={(v) => setActiveRevit(v ? "Y" : "N")} id="activerevit" />
                    <Label htmlFor="activerevit" className="cursor-pointer">Instància Revit activa</Label>
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-violet-400" />
                  <span className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Configuració camp Rosmiman</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pl-5 border-l-2 border-violet-200">
                  <div className="space-y-1.5">
                    <Label>Unitat</Label>
                    <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ex. kW, V, m³/h" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Codi paràmetre</Label>
                    <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="(opcional)" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Agrupació de paràmetre</Label>
                    <Input value={category} onChange={(e) => setCategory(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Taula associada</Label>
                    <Input value={taulaAssoc} onChange={(e) => setTaulaAssoc(e.target.value)} placeholder="(opcional)" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Grup</Label>
                    <Select value={group} onValueChange={setGroup}>
                      <SelectTrigger><SelectValue placeholder="Selecciona grup…" /></SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                        <SelectItem value="__new__">+ Nou grup…</SelectItem>
                      </SelectContent>
                    </Select>
                    {group === "__new__" && <Input placeholder="Nom del nou grup" value={groupCustom} onChange={(e) => setGroupCustom(e.target.value)} autoFocus />}
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
