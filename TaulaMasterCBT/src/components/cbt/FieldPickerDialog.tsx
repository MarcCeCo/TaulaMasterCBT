import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldMeta, isClassifier } from "@/lib/fields";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  fields: FieldMeta[];
  initialSelected: string[];
  onConfirm: (cols: string[]) => void;
}

function buildClassifierMap(fields: FieldMeta[]): Map<string, string> {
  const map = new Map<string, string>();
  let currentClassifier: string | null = null;
  for (const f of fields) {
    if (isClassifier(f)) { currentClassifier = f.name ?? f.col; }
    else if (currentClassifier) { map.set(f.col, currentClassifier); }
  }
  return map;
}

export function FieldPickerDialog({ open, onOpenChange, fields, initialSelected, onConfirm }: Props) {
  const [sel, setSel] = useState<Set<string>>(new Set(initialSelected));
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState<string>("__all__");
  const [cat, setCat] = useState<string>("__all__");
  const [cls, setCls] = useState<string>("__all__");

  useEffect(() => {
    if (open) setSel(new Set(initialSelected));
  }, [open]);

  const groups = useMemo(() => Array.from(new Set(fields.map((f) => f.group).filter(Boolean) as string[])).sort(), [fields]);
  const cats = useMemo(() => Array.from(new Set(fields.map((f) => f.category).filter(Boolean) as string[])).sort(), [fields]);
  const classifiers = useMemo(() => fields.filter(isClassifier), [fields]);
  const classifierMap = useMemo(() => buildClassifierMap(fields), [fields]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return fields.filter((f) => {
      if (isClassifier(f)) return false;
      if (grp !== "__all__" && f.group !== grp) return false;
      if (cat !== "__all__" && f.category !== cat) return false;
      if (cls !== "__all__" && classifierMap.get(f.col) !== cls) return false;
      if (!t) return true;
      return f.col.toLowerCase().includes(t) || (f.name ?? "").toLowerCase().includes(t) || (f.cbt_name ?? "").toLowerCase().includes(t);
    });
  }, [fields, q, grp, cat, cls, classifierMap]);

  const allChecked = filtered.length > 0 && filtered.every((f) => sel.has(f.col));
  const someChecked = filtered.some((f) => sel.has(f.col));

  const toggleAll = () => {
    setSel((prev) => {
      const next = new Set(prev);
      if (allChecked) filtered.forEach((f) => next.delete(f.col));
      else filtered.forEach((f) => next.add(f.col));
      return next;
    });
  };

  const toggle = (col: string) => setSel((prev) => { const next = new Set(prev); next.has(col) ? next.delete(col) : next.add(col); return next; });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl" onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}>
        <DialogHeader><DialogTitle>Selecciona els camps de la taula</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={grp} onValueChange={setGrp}>
            <SelectTrigger><SelectValue placeholder="Grup" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tots els grups</SelectItem>
              {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Totes les categories</SelectItem>
              {cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cls} onValueChange={setCls}>
            <SelectTrigger><SelectValue placeholder="Classificador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tots els classificadors</SelectItem>
              {classifiers.map((c) => <SelectItem key={c.col} value={c.name ?? c.col}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="border rounded-md max-h-[460px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0">
              <tr>
                <th className="w-10 p-2">
                  <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={toggleAll} />
                </th>
                <th className="text-left p-2 text-xs font-semibold">Codi</th>
                <th className="text-left p-2 text-xs font-semibold">Nom</th>
                <th className="text-left p-2 text-xs font-semibold text-[#0099A8]">Format</th>
                <th className="text-left p-2 text-xs font-semibold text-[#0099A8]">Disciplina</th>
                <th className="text-left p-2 text-xs font-semibold text-violet-600">Unitat</th>
                <th className="text-left p-2 text-xs font-semibold text-violet-600">Grup</th>
                <th className="text-left p-2 text-xs font-semibold">Classificador</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const checked = sel.has(f.col);
                return (
                  <tr key={f.col} className={cn("border-t cursor-pointer hover:bg-accent/50", checked && "bg-accent/60")} onClick={() => toggle(f.col)}>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={checked} onCheckedChange={() => toggle(f.col)} />
                    </td>
                    <td className="p-2 font-mono text-xs">{f.col}</td>
                    <td className="p-2">{f.name}</td>
                    <td className="p-2 text-xs text-[#0099A8]">{f.type ?? "—"}</td>
                    <td className="p-2 text-xs text-[#0099A8]">{f.discipline ?? "—"}</td>
                    <td className="p-2 text-xs text-violet-600">{f.unit ?? "—"}</td>
                    <td className="p-2 text-xs text-violet-600">{f.group ?? "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{classifierMap.get(f.col) ?? "—"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Cap camp</td></tr>}
            </tbody>
          </table>
        </div>
        <DialogFooter className="flex items-center sm:justify-between gap-2">
          <Button variant="ghost" onClick={() => setSel(new Set())}>Esborra selecció</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel·la</Button>
            <Button className="bg-[#0099A8] hover:bg-[#006E7A]" onClick={() => { onConfirm(Array.from(sel)); onOpenChange(false); }}>
              Confirma <Badge variant="secondary" className="ml-2">{sel.size}</Badge>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
