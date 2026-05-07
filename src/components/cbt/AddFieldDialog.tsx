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

const TIPUS_DADA_OPTIONS = [
  { value: "0", label: "0 – Text" },
  { value: "1", label: "1 – Numèrica" },
  { value: "2", label: "2 – Taula Associada" },
  { value: "3", label: "3 – Data" },
];

const FORMAT_OPTIONS = ["Text", "Integer", "Number", "Boolean", "Date", "List"];

function generateCbt(nom: string): string {
  return "CBT_" + nom.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9\s_]/g, "").replace(/\s+/g, "_");
}

export function AddFieldDialog({ open, onOpenChange, groups, disciplines, editing, onSubmit, existsCol }: Props) {
  const [nom,            setNom]            = useState("");
  const [isCls,          setIsCls]          = useState(false);
  // Revit
  const [cbt,            setCbt]            = useState("");
  const [formatParam,    setFormatParam]    = useState("Text");
  const [agrupRevit,     setAgrupRevit]     = useState("");
  const [agrupRevitCustom, setAgrupRevitCustom] = useState("");
  const [grupTxt,        setGrupTxt]        = useState("");
  const [instancia,      setInstancia]      = useState("Y");
  const [disciplina,     setDisciplina]     = useState("");
  const [disciplinaCustom, setDisciplinaCustom] = useState("");
  // Rosmiman
  const [codi,           setCodi]           = useState("");
  const [taulaAssoc,     setTaulaAssoc]     = useState("");
  const [tipusDada,      setTipusDada]      = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setNom(editing.col);
      const cls = !editing.cbt && !editing.format_param && !editing.agrupacio_revit && !editing.disciplina && !editing.codi;
      setIsCls(cls);
      setCbt(editing.cbt ?? "");
      setFormatParam(editing.format_param ?? "Text");
      setAgrupRevit(editing.agrupacio_revit ?? ""); setAgrupRevitCustom("");
      setGrupTxt(editing.grup_txt ?? "");
      setInstancia(editing.instancia_revit ?? "Y");
      setDisciplina(editing.disciplina ?? ""); setDisciplinaCustom("");
      setCodi(editing.codi ?? "");
      setTaulaAssoc(editing.taula_assoc ?? "");
      setTipusDada(editing.tipus_dada ?? "");
    } else {
      setNom(""); setIsCls(false); setCbt(""); setFormatParam("Text");
      setAgrupRevit(""); setAgrupRevitCustom(""); setGrupTxt("");
      setInstancia("Y"); setDisciplina(""); setDisciplinaCustom("");
      setCodi(""); setTaulaAssoc(""); setTipusDada("");
    }
  }, [open, editing]);

  const cbtPreview = !isCls && nom ? generateCbt(nom) : "";
  const finalAgrupRevit  = agrupRevit  === "__new__" ? agrupRevitCustom.trim()  : agrupRevit;
  const finalDisciplina  = disciplina  === "__new__" ? disciplinaCustom.trim()  : disciplina;
  const taulaRequired    = tipusDada === "2";

  const submit = () => {
    const col = nom.trim().toUpperCase();
    if (!col) return toast.error("El nom és obligatori");
    if (!/^[A-Z0-9_]+$/.test(col)) return toast.error("Nom no vàlid (només lletres, números i _)");
    if (!editing && existsCol(col)) return toast.error("Aquest nom ja existeix");
    if (taulaRequired && !taulaAssoc.trim()) return toast.error("La taula associada és obligatòria quan el tipus dada és 'Taula Associada'");

    const f: FieldMeta = isCls
      ? { col, codi: null, taula_assoc: null, tipus_dada: null, cbt: null, format_param: null, agrupacio_revit: null, grup_txt: null, instancia_revit: null, disciplina: null }
      : {
          col,
          codi:            codi.trim() || null,
          taula_assoc:     taulaAssoc.trim() || null,
          tipus_dada:      tipusDada || null,
          cbt:             cbt.trim() || cbtPreview || null,
          format_param:    formatParam || null,
          agrupacio_revit: finalAgrupRevit || null,
          grup_txt:        grupTxt.trim() || null,
          instancia_revit: instancia || null,
          disciplina:      finalDisciplina || null,
        };
    onSubmit(f);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edita camp" : "Nou camp"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">

          <div className="col-span-2 space-y-1.5">
            <Label>Nom * <span className="text-muted-foreground text-xs">(clau única, majúscules)</span></Label>
            <Input
              value={nom}
              onChange={(e) => setNom(e.target.value.toUpperCase().replace(/\s/g, ""))}
              disabled={!!editing}
              className="font-mono uppercase"
              placeholder="ex. TAG"
            />
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
                    <Label>CBT</Label>
                    <Input value={cbt || cbtPreview} onChange={(e) => setCbt(e.target.value)} className="font-mono text-xs" placeholder="S'omple automàticament" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Format paràmetre</Label>
                    <Select value={formatParam} onValueChange={setFormatParam}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FORMAT_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Disciplina</Label>
                    <Select value={disciplina} onValueChange={setDisciplina}>
                      <SelectTrigger><SelectValue placeholder="Selecciona disciplina…" /></SelectTrigger>
                      <SelectContent>
                        {disciplines.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        <SelectItem value="__new__">+ Nova disciplina…</SelectItem>
                      </SelectContent>
                    </Select>
                    {disciplina === "__new__" && <Input placeholder="Nova disciplina" value={disciplinaCustom} onChange={(e) => setDisciplinaCustom(e.target.value)} autoFocus />}
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
                    <Input value={grupTxt} onChange={(e) => setGrupTxt(e.target.value)} placeholder="ex. GENERICS EQUIPS" />
                  </div>
                  <div className="col-span-2 flex items-center gap-3 p-2 rounded-md bg-[#0099A8]/5">
                    <Switch checked={instancia === "Y"} onCheckedChange={(v) => setInstancia(v ? "Y" : "N")} id="instancia" />
                    <Label htmlFor="instancia" className="cursor-pointer">Instància Revit activa (Y / N)</Label>
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
                    <Label>Codi</Label>
                    <Input value={codi} onChange={(e) => setCodi(e.target.value)} placeholder="ex. TAG" className="font-mono" />
                  </div>
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
                  <div className="col-span-2 space-y-1.5">
                    <Label>
                      Taula associada{taulaRequired && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Input
                      value={taulaAssoc}
                      onChange={(e) => setTaulaAssoc(e.target.value)}
                      placeholder={taulaRequired ? "Obligatori per a Taula Associada" : "(opcional)"}
                      className={taulaRequired && !taulaAssoc.trim() ? "border-destructive" : ""}
                    />
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
