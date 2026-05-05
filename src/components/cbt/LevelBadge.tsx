import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function LevelBadge({ level, className }: { level: 1 | 2 | 3 | 4; className?: string }) {
  const map: Record<number, string> = {
    1: "bg-slate-700 text-white hover:bg-slate-700",
    2: "bg-blue-600 text-white hover:bg-blue-600",
    3: "bg-emerald-600 text-white hover:bg-emerald-600",
    4: "bg-orange-500 text-white hover:bg-orange-500",
  };
  return (
    <Badge className={cn("border-transparent text-[10px] px-1.5 py-0", map[level], className)}>
      N{level}
    </Badge>
  );
}
