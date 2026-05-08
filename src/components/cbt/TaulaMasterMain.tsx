// src/components/cbt/TaulaMasterMain.tsx
import { lazy, Suspense, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "./AppHeader";
import { EquipmentsTable } from "./EquipmentsTable";
// Diàlegs pesats → lazy: no es descarreguen fins que s'obren per primera vegada
const GubimClassManager    = lazy(() => import("./GubimClassManager").then((m) => ({ default: m.GubimClassManager })));
const FieldsDictionaryDialog = lazy(() => import("./FieldsDictionaryDialog").then((m) => ({ default: m.FieldsDictionaryDialog })));
const UserManagerDialog    = lazy(() => import("@/components/auth/UserManagerDialog").then((m) => ({ default: m.UserManagerDialog })));
import { useFields } from "@/hooks/useFields";
import { useEquipments } from "@/hooks/useEquipments";
import { isClassifier } from "@/lib/fields";
import { useAuth } from "@/lib/auth";
import {
  Database,
  Layers,
  ListChecks,
  Package,
  Table2,
  AlertTriangle,
  ShieldOff,
  RefreshCw,
  WifiOff,
} from "lucide-react";

function StatCardSkeleton() {
  return (
    <Card className="p-4 flex items-center gap-3 border-0 shadow-sm bg-white">
      <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-12" />
        <Skeleton className="h-3 w-16" />
      </div>
    </Card>
  );
}

export function TaulaMasterMain() {
  const { fields, fieldMap, loading: fieldsLoading, error: fieldsError, retry: retryFields } = useFields();
  const { items, loading: equipLoading, error: equipError, retry: retryEquip } = useEquipments();
  const { canSeeView, profile, user } = useAuth();
  const [gubim, setGubim] = useState(false);
  const [dict, setDict] = useState(false);
  const [users, setUsers] = useState(false);

  const isLoading = fieldsLoading || equipLoading;
  const hasError  = !!fieldsError || !!equipError;

  const stats = useMemo(() => {
    const nonClassifiers = fields.filter((f) => !isClassifier(f));
    const total = nonClassifiers.length;
    const active = nonClassifiers.filter((f) => f.active === "Y").length;
    const groups = Array.from(
      new Set(fields.map((f) => f.group).filter(Boolean) as string[])
    );
    const totalEquips = items.length;
    const equipWithTable = items.filter((e) => e.needsTable).length;
    const usedCols = new Set(items.flatMap((e) => e.fieldCols));
    const usedCount = [...usedCols].filter((c) => fieldMap.has(c)).length;
    const orphanCount = [...usedCols].filter((c) => !fieldMap.has(c)).length;
    const usagePercent = total > 0 ? Math.round((usedCount / total) * 100) : 0;
    return { total, active, groups, totalEquips, equipWithTable, usedCount, usagePercent, orphanCount };
  }, [fields, items, fieldMap]);

  const profileLoaded = !!profile || !user;
  const noAccessAtAll =
    profileLoaded &&
    !canSeeView("equips") &&
    !canSeeView("gubimclass") &&
    !canSeeView("fields");

  return (
    <div className="min-h-screen bg-[#F5F7F8]">
      <AppHeader
        onOpenGubim={() => setGubim(true)}
        onOpenFields={() => setDict(true)}
        onOpenUsers={() => setUsers(true)}
      />

      <main className="mx-auto max-w-[1600px] px-6 py-6 space-y-6">
        {noAccessAtAll ? (
          <Card className="p-12 border-0 shadow-sm bg-white flex flex-col items-center gap-4 text-center">
            <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
              <ShieldOff className="h-7 w-7 text-slate-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">Sense accés assignat</p>
              <p className="text-sm text-muted-foreground mt-1">
                No tens permisos per veure cap secció d&apos;aquesta aplicació.
                <br />
                Contacta amb l&apos;administrador.
              </p>
            </div>
          </Card>
        ) : (
          <>
            {/* Banner d'error de xarxa */}
            {hasError && !isLoading && (
              <Card className="p-4 border border-amber-200 bg-amber-50 flex items-center gap-3">
                <WifiOff className="h-5 w-5 text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800">Error carregant dades</p>
                  <p className="text-xs text-amber-700 truncate">
                    {fieldsError ?? equipError}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0"
                  onClick={() => { retryFields(); retryEquip(); }}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Reintenta
                </Button>
              </Card>
            )}

            {canSeeView("equips") && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
                ) : (
                  <>
                    <Card className="p-4 flex items-center gap-3 border-0 shadow-sm bg-white">
                      <div className="h-10 w-10 rounded-lg bg-[#0099A8]/10 text-[#0099A8] flex items-center justify-center shrink-0">
                        <Database className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Total camps</div>
                        <div className="text-2xl font-bold text-[#006E7A]">{stats.total}</div>
                        <div className="text-xs text-muted-foreground">{stats.active} actius</div>
                      </div>
                    </Card>

                    <Card className="p-4 flex items-center gap-3 border-0 shadow-sm bg-white">
                      <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <ListChecks className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Camps usats</div>
                        <div className="text-2xl font-bold text-emerald-700">{stats.usedCount}</div>
                        <div className="text-xs text-muted-foreground">{stats.usagePercent}% del diccionari</div>
                      </div>
                    </Card>

                    <Card className="p-4 flex items-center gap-3 border-0 shadow-sm bg-white">
                      <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <Layers className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Grups</div>
                        <div className="text-2xl font-bold text-blue-700">{stats.groups.length}</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {stats.groups.slice(0, 2).map((g) => (
                            <Badge key={g} variant="secondary" className="text-[10px] px-1.5 py-0">{g}</Badge>
                          ))}
                          {stats.groups.length > 2 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{stats.groups.length - 2}</Badge>
                          )}
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4 flex items-center gap-3 border-0 shadow-sm bg-white">
                      <div className="h-10 w-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Equips</div>
                        <div className="text-2xl font-bold text-violet-700">{stats.totalEquips}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="text-emerald-600 font-semibold">{stats.equipWithTable}</span> amb taula
                        </div>
                      </div>
                    </Card>

                    <Card className={`p-4 flex items-center gap-3 border-0 shadow-sm ${stats.orphanCount > 0 ? "bg-amber-50 border border-amber-200" : "bg-white"}`}>
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${stats.orphanCount > 0 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-400"}`}>
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Refs. trencades</div>
                        <div className={`text-2xl font-bold ${stats.orphanCount > 0 ? "text-amber-600" : "text-slate-400"}`}>{stats.orphanCount}</div>
                        <div className="text-xs text-muted-foreground">{stats.orphanCount > 0 ? "camps no trobats" : "tot correcte"}</div>
                      </div>
                    </Card>
                  </>
                )}
              </div>
            )}

            {canSeeView("equips") && (
              <Card className="p-4 border-0 shadow-sm bg-white">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-[#006E7A]">Equips</h2>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Table2 className="h-3.5 w-3.5" />
                    <span>{stats.equipWithTable} taules definides · {stats.totalEquips} equips</span>
                  </div>
                </div>
                <EquipmentsTable />
              </Card>
            )}
          </>
        )}
      </main>

      <Suspense fallback={null}>
        <GubimClassManager open={gubim} onOpenChange={setGubim} />
        <FieldsDictionaryDialog open={dict} onOpenChange={setDict} />
        <UserManagerDialog open={users} onOpenChange={setUsers} />
      </Suspense>
    </div>
  );
}


