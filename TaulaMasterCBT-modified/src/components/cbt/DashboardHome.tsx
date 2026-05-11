// src/components/cbt/DashboardHome.tsx
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowRight,
  Database,
  GitBranch,
  Layers,
  ListChecks,
  Package,
  Settings2,
  Table2,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { isClassifier } from "@/lib/fields";
import { useDataStore } from "@/lib/dataStore";
import { useAuth } from "@/lib/auth";

interface Props {
  onGoEquips: () => void;
  onOpenGubim: () => void;
  onOpenFields: () => void;
}

function StatCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`p-5 flex items-center gap-4 border-0 shadow-sm transition-shadow hover:shadow-md ${
        highlight ? "bg-amber-50 border border-amber-200" : "bg-white"
      }`}
    >
      <div
        className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold leading-none mb-1">
          {label}
        </div>
        <div
          className={`text-2xl font-bold leading-tight ${
            highlight ? "text-amber-600" : "text-slate-800"
          }`}
        >
          {value}
        </div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="p-5 flex items-center gap-4 border-0 shadow-sm bg-white">
      <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-14" />
        <Skeleton className="h-3 w-16" />
      </div>
    </Card>
  );
}

export function DashboardHome({ onGoEquips, onOpenGubim, onOpenFields }: Props) {
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
    return { total, totalEquips, equipWithTable, usedCount, usagePercent, orphanCount, fieldGroups: fieldGroups.length };
  }, [fields, items, fieldMap, fieldGroups]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Resum general</h1>
          <p className="text-sm text-slate-500 mt-1">
            Visió general de l'estat de la Taula Master
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Sistema operatiu
        </div>
      </div>

      {/* Error banner */}
      {error && !loading && (
        <Card className="p-4 border border-amber-200 bg-amber-50 flex items-center gap-3">
          <WifiOff className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">Error carregant dades</p>
            <p className="text-xs text-amber-700 truncate">{error}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0"
            onClick={retry}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Reintenta
          </Button>
        </Card>
      )}

      {/* Stats grid */}
      {canSeeView("equips") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                icon={<Package className="h-6 w-6" />}
                iconBg="bg-violet-100"
                iconColor="text-violet-600"
                label="Equips totals"
                value={stats.totalEquips}
                sub={<><span className="text-emerald-500 font-semibold">{stats.equipWithTable}</span> amb taula definida</>}
              />
              <StatCard
                icon={<Database className="h-6 w-6" />}
                iconBg="bg-[#0099A8]/10"
                iconColor="text-[#0099A8]"
                label="Camps al diccionari"
                value={stats.total}
                sub={`${stats.usagePercent}% en ús`}
              />
              <StatCard
                icon={<ListChecks className="h-6 w-6" />}
                iconBg="bg-emerald-100"
                iconColor="text-emerald-600"
                label="Camps en ús"
                value={stats.usedCount}
                sub={`De ${stats.total} disponibles`}
              />
              <StatCard
                icon={<Layers className="h-6 w-6" />}
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                label="Grups de camps"
                value={stats.fieldGroups}
                sub="Agrupacions del diccionari"
              />
              <StatCard
                icon={<Table2 className="h-6 w-6" />}
                iconBg="bg-sky-100"
                iconColor="text-sky-600"
                label="Amb taula"
                value={stats.equipWithTable}
                sub="Equips amb taula de valors"
              />
              <StatCard
                icon={<AlertTriangle className="h-6 w-6" />}
                iconBg={stats.orphanCount > 0 ? "bg-amber-100" : "bg-slate-100"}
                iconColor={stats.orphanCount > 0 ? "text-amber-600" : "text-slate-400"}
                label="Refs. trencades"
                value={stats.orphanCount}
                sub={stats.orphanCount > 0 ? "Camps no trobats al diccionari" : "Tot correcte"}
                highlight={stats.orphanCount > 0}
              />
            </>
          )}
        </div>
      )}

      {/* Quick access cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-3">
          Accés ràpid
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {canSeeView("equips") && (
            <button
              onClick={onGoEquips}
              className="group text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-[#0099A8]/40 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="h-9 w-9 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                  <Package className="h-5 w-5" />
                </div>
                <span className="font-semibold text-slate-700 group-hover:text-[#006E7A] transition-colors">
                  Equips
                </span>
                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#0099A8] ml-auto transition-colors" />
              </div>
              <p className="text-xs text-slate-500">
                Consulta i gestiona tots els equips tècnics registrats
              </p>
            </button>
          )}
          {canSeeView("gubimclass") && (
            <button
              onClick={onOpenGubim}
              className="group text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-[#0099A8]/40 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="h-9 w-9 rounded-lg bg-[#0099A8]/10 text-[#0099A8] flex items-center justify-center">
                  <GitBranch className="h-5 w-5" />
                </div>
                <span className="font-semibold text-slate-700 group-hover:text-[#006E7A] transition-colors">
                  GuBIMClass
                </span>
                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#0099A8] ml-auto transition-colors" />
              </div>
              <p className="text-xs text-slate-500">
                Classificació jeràrquica d'elements BIM
              </p>
            </button>
          )}
          {canSeeView("fields") && (
            <button
              onClick={onOpenFields}
              className="group text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-[#0099A8]/40 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="h-9 w-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Settings2 className="h-5 w-5" />
                </div>
                <span className="font-semibold text-slate-700 group-hover:text-[#006E7A] transition-colors">
                  Diccionari de camps
                </span>
                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#0099A8] ml-auto transition-colors" />
              </div>
              <p className="text-xs text-slate-500">
                Defineix i organitza els paràmetres tècnics
              </p>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
