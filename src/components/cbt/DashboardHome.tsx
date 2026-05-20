// src/components/cbt/DashboardHome.tsx — CBT redesign v2
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Database, Layers, ListChecks,
  Package, RefreshCw, Table2, WifiOff,
} from "lucide-react";
import { isClassifier } from "@/lib/fields";
import { useDataStore } from "@/lib/dataStore";
import { useAuth } from "@/lib/auth";

/* ─ Stat card ─────────────────────────────────────────────────────────────── */
interface StatCardProps {
  icon: React.ReactNode;
  accentColor: string;
  accentBg: string;
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  badge?: string;
  badgeStyle?: React.CSSProperties;
  highlight?: boolean;
  stagger?: number;
}

function StatCard({ icon, accentColor, accentBg, label, value, sub, badge, badgeStyle, highlight, stagger = 1 }: StatCardProps) {
  return (
    <div
      className={`cbt-stat-card animate-fade-in-up stagger-${stagger} relative overflow-hidden rounded-2xl p-5 border cursor-default`}
      style={{
        background: highlight ? "#FFFBF0" : "#fff",
        borderColor: highlight ? "rgba(245,158,11,0.25)" : "rgba(0,90,99,0.08)",
        boxShadow: "0 1px 4px rgba(0,61,68,0.04)",
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-5 right-5 h-[2px] rounded-b-full"
        style={{ background: highlight ? "linear-gradient(90deg, #F59E0B, #FBBF24)" : `linear-gradient(90deg, ${accentColor}, ${accentColor}88)` }}
      />

      <div className="flex items-start gap-4">
        {/* Icona */}
        <div
          className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: highlight ? "rgba(245,158,11,0.1)" : accentBg }}
        >
          <span style={{ color: highlight ? "#D97706" : accentColor }}>{icon}</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span
              className="uppercase tracking-[0.1em] font-bold leading-none"
              style={{ fontSize: "9.5px", color: "#94a3b8" }}
            >
              {label}
            </span>
            {badge && (
              <span
                className="text-[9.5px] px-2 py-0.5 rounded-full font-semibold shrink-0"
                style={badgeStyle}
              >
                {badge}
              </span>
            )}
          </div>
          <div
            className="font-bold tracking-tight leading-none mb-1"
            style={{ fontSize: "28px", color: highlight ? "#B45309" : "#1A2E35" }}
          >
            {value}
          </div>
          {sub && (
            <div className="text-[11.5px] leading-tight" style={{ color: "#94a3b8" }}>{sub}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border p-5 bg-white" style={{ borderColor: "rgba(0,90,99,0.08)" }}>
      <div className="flex items-center gap-4">
        <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-7 w-14" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
    </div>
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

    // PERF FIX: un sol pass sobre items en lloc de flatMap + filter + filter
    // Abans: 3 iteracions O(n) separades. Ara: 1 iteració.
    let equipWithTable = 0;
    const usedCols = new Set<string>();
    for (const e of items) {
      if (e.needsTable) equipWithTable++;
      for (const c of e.fieldCols) usedCols.add(c);
    }

    let usedCount = 0;
    let orphanCount = 0;
    for (const c of usedCols) {
      if (fieldMap.has(c)) usedCount++;
      else orphanCount++;
    }

    const usagePercent = total > 0 ? Math.round((usedCount / total) * 100) : 0;
    return { total, totalEquips, equipWithTable, usedCount, usagePercent, orphanCount, fieldGroups: fieldGroups.length };
  }, [fields, items, fieldMap, fieldGroups]);

  return (
    <div className="space-y-6">

      {/* ── Capçalera ─────────────────────────────────────────────────────── */}
      <div className="animate-fade-in-up stagger-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight leading-tight" style={{ color: "#0D2027" }}>
            Resum general
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "#94a3b8" }}>
            Visió global de l'estat de la Taula Master
          </p>
        </div>

        {/* Status pill */}
        <div
          className="hidden sm:flex items-center gap-2 text-[11px] font-semibold px-3.5 py-2 rounded-full shrink-0"
          style={{
            background: "rgba(16,185,129,0.08)",
            color: "#047857",
            border: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Sistema operatiu
        </div>
      </div>

      {/* ── Banner d'error ─────────────────────────────────────────────────── */}
      {error && !loading && (
        <div
          className="animate-fade-in-up p-4 rounded-2xl flex items-center gap-3"
          style={{ background: "#FFFBF0", border: "1px solid rgba(245,158,11,0.25)" }}
        >
          <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(245,158,11,0.12)" }}>
            <WifiOff className="h-4.5 w-4.5" style={{ color: "#D97706" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold" style={{ color: "#92400E" }}>Error carregant dades</p>
            <p className="text-[12px] truncate" style={{ color: "#B45309" }}>{error}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8 shrink-0 font-semibold"
            style={{ borderColor: "rgba(245,158,11,0.4)", color: "#92400E" }}
            onClick={retry}
          >
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Reintenta
          </Button>
        </div>
      )}

      {/* ── Grid d'estadístiques ─────────────────────────────────────────── */}
      {canSeeView("equips") && (
        <>
          {/* Mini title */}
          <div className="animate-fade-in-up stagger-2 flex items-center gap-3">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: "#94a3b8" }}>
              Estadístiques
            </span>
            <div className="flex-1 h-px" style={{ background: "rgba(0,90,99,0.08)" }} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard
                  icon={<Package className="h-5 w-5" />}
                  accentColor="#7C3AED"
                  accentBg="rgba(124,58,237,0.08)"
                  label="Equips totals"
                  value={stats.totalEquips}
                  sub={<><span style={{ color: "#059669", fontWeight: 600 }}>{stats.equipWithTable}</span>{" "}amb taula definida</>}
                  badge="+12 nous"
                  badgeStyle={{ background: "rgba(16,185,129,0.1)", color: "#047857", border: "1px solid rgba(16,185,129,0.2)" }}
                  stagger={1}
                />

                <StatCard
                  icon={<Database className="h-5 w-5" />}
                  accentColor="#0099A8"
                  accentBg="rgba(0,153,168,0.08)"
                  label="Camps al diccionari"
                  value={stats.total}
                  sub={`${stats.usagePercent}% en ús actiu`}
                  badge={`${stats.usagePercent}%`}
                  badgeStyle={{ background: "rgba(0,153,168,0.1)", color: "#007380", border: "1px solid rgba(0,153,168,0.2)" }}
                  stagger={2}
                />

                <StatCard
                  icon={<ListChecks className="h-5 w-5" />}
                  accentColor="#059669"
                  accentBg="rgba(5,150,105,0.08)"
                  label="Camps en ús"
                  value={stats.usedCount}
                  sub={`De ${stats.total} disponibles`}
                  badge="Complet"
                  badgeStyle={{ background: "rgba(5,150,105,0.1)", color: "#047857", border: "1px solid rgba(5,150,105,0.2)" }}
                  stagger={3}
                />

                <StatCard
                  icon={<Layers className="h-5 w-5" />}
                  accentColor="#2563EB"
                  accentBg="rgba(37,99,235,0.08)"
                  label="Grups de camps"
                  value={stats.fieldGroups}
                  sub="Agrupacions del diccionari"
                  stagger={4}
                />

                <StatCard
                  icon={<Table2 className="h-5 w-5" />}
                  accentColor="#0EA5E9"
                  accentBg="rgba(14,165,233,0.08)"
                  label="Amb taula"
                  value={stats.equipWithTable}
                  sub="Equips amb taula de valors"
                  badge="+3 nous"
                  badgeStyle={{ background: "rgba(14,165,233,0.1)", color: "#0369A1", border: "1px solid rgba(14,165,233,0.2)" }}
                  stagger={5}
                />

                <StatCard
                  icon={<AlertTriangle className="h-5 w-5" />}
                  accentColor={stats.orphanCount > 0 ? "#D97706" : "#94a3b8"}
                  accentBg={stats.orphanCount > 0 ? "rgba(217,119,6,0.08)" : "rgba(148,163,184,0.08)"}
                  label="Refs. trencades"
                  value={stats.orphanCount}
                  sub={stats.orphanCount > 0 ? "Camps no trobats al diccionari" : "Tot correcte ✓"}
                  badge={stats.orphanCount > 0 ? "Atenció" : undefined}
                  badgeStyle={{ background: "rgba(245,158,11,0.12)", color: "#92400E", border: "1px solid rgba(245,158,11,0.25)" }}
                  highlight={stats.orphanCount > 0}
                  stagger={6}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
