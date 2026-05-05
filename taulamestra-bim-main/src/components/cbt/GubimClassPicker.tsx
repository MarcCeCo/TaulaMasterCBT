import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GubimNode, codeLevel, parentCode } from "@/hooks/useGubimClass";
import { LevelBadge } from "./LevelBadge";

interface Props {
  nodes: GubimNode[];
  nodeMap: Map<string, GubimNode>;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function GubimClassPicker({ nodes, nodeMap, value, onChange, placeholder = "Selecciona GuBIMClass…", disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return nodes;
    return nodes.filter((n) => n.code.toLowerCase().includes(t) || n.name.toLowerCase().includes(t));
  }, [nodes, q]);

  const sel = value ? nodeMap.get(value) : undefined;

  return (
    <div className="flex items-center gap-1 w-full">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="w-full justify-between font-normal min-h-[40px] h-auto"
          >
            {sel ? (
              <span className="flex items-center gap-2 truncate">
                <LevelBadge level={codeLevel(sel.code)} />
                <span className="font-mono text-xs shrink-0">{sel.code}</span>
                <span className="truncate">{sel.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[520px] p-0"
          align="start"
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}
        >
          {/* Buscador de codi GuBIMClass */}
          <div className="p-2 border-b flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Cerca per codi o nom…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 border-0 focus-visible:ring-0 p-0"
              autoFocus
            />
            {q && (
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setQ("")}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="max-h-80 overflow-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Cap resultat</div>
            ) : (
              filtered.map((n) => {
                const lvl = codeLevel(n.code);
                const pc = parentCode(n.code);
                const parent = pc ? nodeMap.get(pc) : null;
                const indent = ["pl-2", "pl-6", "pl-10", "pl-14"][lvl - 1];
                const isSel = value === n.code;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => { onChange(n.code); setOpen(false); setQ(""); }}
                    className={cn(
                      "w-full flex items-start gap-2 py-2 pr-3 text-left hover:bg-accent text-sm transition-colors",
                      indent,
                      isSel && "bg-accent",
                    )}
                  >
                    <Check className={cn("h-4 w-4 mt-0.5 shrink-0 text-[#0099A8]", isSel ? "opacity-100" : "opacity-0")} />
                    <LevelBadge level={lvl} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs shrink-0">{n.code}</span>
                        <span className="truncate font-medium">{n.name}</span>
                      </div>
                      {parent && (
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                          ↳ {parent.code} · {parent.name}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value && !disabled && (
        <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => onChange("")} title="Esborra selecció">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
