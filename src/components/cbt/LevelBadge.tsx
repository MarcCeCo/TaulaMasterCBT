// src/components/cbt/LevelBadge.tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Badge de nivell GuBIMClass (N1–N4).
 * Paleta alineada amb la identitat CBT Besòs·Tordera:
 *  N1 → fosc corporatiu  (#003D44)
 *  N2 → teal primari     (#007380)
 *  N3 → teal clar        (#1AAFC0)
 *  N4 → verd suau        (emerald, per diferenciar sub-nivells)
 */
export function LevelBadge({ level, className }: { level: 1 | 2 | 3 | 4; className?: string }) {
  const map: Record<number, string> = {
    1: "bg-[#003D44] text-white hover:bg-[#003D44]",
    2: "bg-[#007380] text-white hover:bg-[#007380]",
    3: "bg-[#1AAFC0] text-white hover:bg-[#1AAFC0]",
    4: "bg-emerald-600 text-white hover:bg-emerald-600",
  };

  return (
    <Badge
      className={cn(
        "border-transparent text-[10px] px-1.5 py-0 font-semibold tracking-wide",
        map[level],
        className
      )}
    >
      N{level}
    </Badge>
  );
}
