import { useEffect, useMemo, useRef, useState } from "react";
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

const ROW_H = 36;
const OVERSCAN = 10;
const CONTAINER_H = 460;

function buildClassifierMap(fields: FieldMeta[]): Map<string, string> {
  const map = new Map<string, string>();
  let cur: string | null = null;
  for (const f of fields) {
    if (isClassifier(f)) { cur = f.col; }
    else if (cur) { map.set(f.col, cur); }
  }
  return map;
}

export function FieldPickerDialog({ open, onOpenChange, fields, initialSelected, onConfirm }: Props) {
  const [sel, setSel]   = useState<Set<string>>(new Set(initialSelected));
  const [q, setQ]       = useState("");
  const [grp, setGrp]   = useState("__all__");
  const [cat, setCat]   = useState("__all__");
  const [cls, setCls]   = useState("__all__");
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSel(new Set(initialSelected));
      setScrollTop(0);
      containerRef.current?.scrollTo(0, 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const groups      = useMemo(() => Array.from(new Set(fields.map((f) => f.agrupacio_revit).filter(Boolean) as string[])).sort(), [fields]);
  const cats        = useMemo(() => Array.from(new Set(fields.map((f) => f.disciplina).filter(Boolean) as string[])).sort(), [fields]);
  const classifiers = useMemo(() => fields.filter(isClassifier), [fields]);
  const clsMap      = useMemo(() => buildClassifierMap(fields), [fields]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return fields.filter((f) => {
      if (isClassifier(f)) return false;
      if (grp !== "__all__" && f.agrupacio_revit !== grp) return false;
      if (cat !== "__all__" && f.disciplina !== cat) return false;
      if (cls !== "__all__" && clsMap.get(f.col) !== cls) return false;
      if (!t) return true;
      return (f.codi ?? "").toLowerCase().includes(t) ||
             (f.col  ?? "").toLowerCase().includes(t) ||
             (f.cbt  ?? "").toLowerCase().includes(t);
    });
  }, [fields, q, grp, cat, cls, clsMap]);

  const allChecked  = filtered.length > 0 && filtered.every((f) => sel.has(f.col));
  const someChecked = filtered.some((f) => sel.has(f.col));
  const toggleAll   = () => setSel((prev) => { const n = new Set(prev); if (allChecked) filtered.forEach((f) => n.delete(f.col)); else filtered.forEach((f) => n.add(f.col)); return n; });
  const toggle      = (col: string) => setSel((prev) => { const n = new Set(prev); n.has(col) ? n.delete(col) : n.add(col); return n; });

  // Virtualització: only render visible rows
  const startIdx   = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx     = Math.min(filtered.length - 1, Math.ceil((scrollTop + CONTAINER_H) / ROW_H) + OVERSCAN);
  const visibleRows = filtered.slice(startIdx, endIdx + 1);
  const padTop     = startIdx * ROW_H;
  const padBot     = Math.max(0, (filtered.length - endIdx - 1) * ROW_H);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl" onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}>
        <DialogHeader><DialogTitle>Selecciona els camps de la taula</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <Select value={grp} onValueChange={setGrp}>
            <SelectTrigger><SelectValue placeholder="Grup" /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">Tots els grups</SelectItem>{groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">Totes les categories</SelectItem>{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={cls} onValueChange={setCls}>
            <SelectTrigger><SelectValue placeholder="Classificador" /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">Tots els classificadors</SelectItem>{classifiers.map((c) => <SelectItem key={c.col} value={c.col}>{c.col}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="border rounded-md overflow-hidden">
          {/* Capçalera fixa fora del scroll */}
          <table className="w-full text-sm table-fixed">
            <thead className="bg-muted/60">
              <tr>
                <th className="w-10 p-2"><Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={toggleAll} /></th>
                <th className="text-left p-2 text-xs font-semibold">Nom</th>
                <th className="text-left p-2 text-xs font-semibold text-[#0099A8]">Format</th>
                <th className="text-left p-2 text-xs font-semibold text-[#0099A8]">Disciplina</th>
                <th className="text-left p-2 text-xs font-semibold text-[#0099A8]">Agrupació Revit</th>
                <th className="text-left p-2 text-xs font-semibold text-[#0099A8]">Grup .txt</th>
                <th className="text-left p-2 text-xs font-semibold text-violet-600 w-24">Codi</th>
                <th className="text-left p-2 text-xs font-semibold w-32">Classificador</th>
              </tr>
            </thead>
          </table>
          {/* Cos virtualitzat */}
          <div ref={containerRef} style={{ maxHeight: CONTAINER_H, overflowY: "auto" }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
            <table className="w-full text-sm table-fixed">
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Cap camp</td></tr>
                ) : (
                  <>
                    {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={8} /></tr>}
                    {visibleRows.map((f) => {
                      const checked = sel.has(f.col);
                      return (
                        <tr key={f.col} style={{ height: ROW_H }} className={cn("border-t cursor-pointer hover:bg-accent/50", checked && "bg-accent/60")} onClick={() => toggle(f.col)}>
                          <td className="w-10 p-2" onClick={(e) => e.stopPropagation()}><Checkbox checked={checked} onCheckedChange={() => toggle(f.col)} /></td>
                          <td className="p-2 font-medium truncate">{f.col}</td>
                          <td className="p-2 text-xs text-[#0099A8] truncate">{f.format_param ?? "—"}</td>
                          <td className="p-2 text-xs text-[#0099A8] truncate">{f.disciplina ?? "—"}</td>
                          <td className="p-2 text-xs text-[#0099A8] truncate">{f.agrupacio_revit ?? "—"}</td>
                          <td className="p-2 text-xs text-[#0099A8] truncate">{f.grup_txt ?? "—"}</td>
                          <td className="p-2 font-mono text-xs text-violet-600 truncate w-24">{f.codi ?? "—"}</td>
                          <td className="p-2 text-xs text-muted-foreground truncate w-32">{clsMap.get(f.col) ?? "—"}</td>
                        </tr>
                      );
                    })}
                    {padBot > 0 && <tr style={{ height: padBot }}><td colSpan={8} /></tr>}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>{filtered.length} camps visibles · {sel.size} seleccionats</span>
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
