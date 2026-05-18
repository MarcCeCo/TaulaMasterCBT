// src/components/cbt/DashboardHome.tsx
// Dashboard d'inici — stats i gràfic de distribució, sense Quick Access (el sidebar ja hi és).
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Database,
  Layers,
  ListChecks,
  Package,
  RefreshCw,
  Table2,
  WifiOff,
} from "lucide-react";
import { isClassifier } from "@/lib/fields";
import { useDataStore } from "@/lib/dataStore";
import { useAuth } from "@/lib/auth";

/* ─ Stat card ─────────────────────────────────────────────────────────────── */
function StatCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  trend,
  trendVariant = "neutral",
  highlight,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  trend?: string;
  trendVariant?: "up" | "warn" | "neutral" | "ok";
  highlight?: boolean;
}) {
  const trendClass: Record<string, string> = {
    up:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
    ok:      "bg-[#EAF8FA] text-[#007380] border border-[#C8EFF4]",
    warn:    "bg-amber-50 text-amber-700 border border-amber-200",
    neutral: "bg-slate-50 text-slate-500 border border-slate-200",
  };

  return (
    <Card
      className={[
        "relative overflow-hidden p-5 flex items-center gap-4 border shadow-sm",
        "transition-shadow hover:shadow-md cursor-default",
        highlight
          ? "bg-amber-50 border-amber-200"
          : "bg-white border-slate-200",
      ].join(" ")}
    >
      {/* Accent line esquerra */}
      <div
        className={[
          "absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full",
          highlight ? "bg-amber-400" : "bg-[#0099A8]",
        ].join(" ")}
      />

      {/* Icona */}
      <div
        className={[
          "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
          iconBg, iconColor,
        ].join(" ")}
      >
        {icon}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="text-[10.5px] text-slate-400 uppercase tracking-[0.1em] font-semibold leading-none">
            {label}
          </div>
          {trend && (
            <span className={["text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0", trendClass[trendVariant]].join(" ")}>
              {trend}
            </span>
          )}
        </div>
        <div
          className={[
            "text-[26px] font-semibold leading-tight tracking-tight",
            highlight ? "text-amber-600" : "text-slate-800",
          ].join(" ")}
        >
          {value}
        </div>
        {sub && (
          <div className="text-[11.5px] text-slate-400 mt-0.5">{sub}</div>
        )}
      </div>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="p-5 flex items-center gap-4 border-slate-200 shadow-sm bg-white">
      <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-7 w-14" />
        <Skeleton className="h-2.5 w-24" />
      </div>
    </Card>
  );
}

/* ─ Component principal ───────────────────────────────────────────────────── */
export function DashboardHome() {
  const { fields, fieldMap, fieldGroups, equipments: items, loading, error, retry } = useDataStore();
  const { canSeeView } = useAuth();

  const stats = useMemo(() => {
    const nonClassifiers = fields.filter((f) => !isClassifier(f));
    const total = nonClassifiers.length;
    const totalEquips = items.length;
    const equipWithTable = items.filter((e) => e.needsTable).length;
    const usedCols = new Set(items.flatMap((e) => e.fieldCols));
    const usedCount = [...usedCols].filter((c) => fieldMap.has(c)).length;
    const orphanCount = [...usedCols].filter((c) => !fieldMap.has(c)).length;
    const usagePercent = total > 0 ? Math.round((usedCount / total) * 100) : 0;
    return {
      total, totalEquips, equipWithTable,
      usedCount, usagePercent, orphanCount,
      fieldGroups: fieldGroups.length,
    };
  }, [fields, items, fieldMap, fieldGroups]);

  return (
    <div className="space-y-6">

      {/* ── Capçalera ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-800 tracking-tight leading-tight">
            Resum general
          </h1>
          <p className="text-[13px] text-slate-400 mt-1">
            Visió global de l'estat de la Taula Master
          </p>
        </div>

        {/* Indicador d'estat */}
        <div className="hidden sm:flex items-center gap-2 text-[11.5px] text-slate-400 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Sistema operatiu
        </div>
      </div>

      {/* ── Banner d'error ─────────────────────────────────────────────── */}
      {error && !loading && (
        <Card className="p-4 border border-amber-200 bg-amber-50 flex items-center gap-3 shadow-sm">
          <WifiOff className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-amber-800">Error carregant dades</p>
            <p className="text-[12px] text-amber-700 truncate">{error}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0 h-8 text-xs"
            onClick={retry}
          >
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Reintenta
          </Button>
        </Card>
      )}

      {/* ── Grid d'estadístiques ───────────────────────────────────────── */}
      {canSeeView("equips") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                icon={<Package className="h-5 w-5" />}
                iconBg="bg-violet-50"
                iconColor="text-violet-600"
                label="Equips totals"
                value={stats.totalEquips}
                sub={
                  <>
                    <span className="text-emerald-600 font-semibold">{stats.equipWithTable}</span>
                    {" "}amb taula definida
                  </>
                }
                trend="+12 nous"
                trendVariant="up"
              />

              <StatCard
                icon={<Database className="h-5 w-5" />}
                iconBg="bg-[#EAF8FA]"
                iconColor="text-[#007380]"
                label="Camps al diccionari"
                value={stats.total}
                sub={`${stats.usagePercent}% en ús`}
                trend={`${stats.usagePercent}% en ús`}
                trendVariant="ok"
              />

              <StatCard
                icon={<ListChecks className="h-5 w-5" />}
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
                label="Camps en ús"
                value={stats.usedCount}
                sub={`De ${stats.total} disponibles`}
                trend="Complet"
                trendVariant="up"
              />

              <StatCard
                icon={<Layers className="h-5 w-5" />}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
                label="Grups de camps"
                value={stats.fieldGroups}
                sub="Agrupacions del diccionari"
                trendVariant="neutral"
              />

              <StatCard
                icon={<Table2 className="h-5 w-5" />}
                iconBg="bg-sky-50"
                iconColor="text-sky-600"
                label="Amb taula"
                value={stats.equipWithTable}
                sub="Equips amb taula de valors"
                trend="+3 nous"
                trendVariant="up"
              />

              <StatCard
                icon={<AlertTriangle className="h-5 w-5" />}
                iconBg={stats.orphanCount > 0 ? "bg-amber-50" : "bg-slate-50"}
                iconColor={stats.orphanCount > 0 ? "text-amber-600" : "text-slate-400"}
                label="Refs. trencades"
                value={stats.orphanCount}
                sub={stats.orphanCount > 0 ? "Camps no trobats al diccionari" : "Tot correcte"}
                trend={stats.orphanCount > 0 ? "Atenció" : undefined}
                trendVariant="warn"
                highlight={stats.orphanCount > 0}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
