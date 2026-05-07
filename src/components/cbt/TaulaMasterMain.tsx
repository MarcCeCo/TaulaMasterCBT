// src/components/cbt/TaulaMasterMain.tsx
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "./AppHeader";
import { EquipmentsTable } from "./EquipmentsTable";
import { GubimClassManager } from "./GubimClassManager";
import { FieldsDictionaryDialog } from "./FieldsDictionaryDialog";
import { UserManagerDialog } from "@/components/auth/UserManagerDialog";
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
} from "lucide-react";

export function TaulaMasterMain() {
  const { fields, fieldMap } = useFields();
  const { items } = useEquipments();
  const { canSeeView } = useAuth();
  const [gubim, setGubim] = useState(false);
  const [dict, setDict] = useState(false);
  const [users, setUsers] = useState(false);

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
    return {
      total,
      active,
      groups,
      totalEquips,
      equipWithTable,
      usedCount,
      usagePercent,
      orphanCount,
    };
  }, [fields, items, fieldMap]);

  return (
    <div className="min-h-screen bg-[#F5F7F8]">
      <AppHeader
        onOpenGubim={() => setGubim(true)}
        onOpenFields={() => setDict(true)}
        onOpenUsers={() => setUsers(true)}
      />

      <main className="mx-auto max-w-[1600px] px-6 py-6 space-y-6">
        {/* Estadístiques — només si pot veure equips */}
        {canSeeView("equips") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="p-4 flex items-center gap-3 border-0 shadow-sm bg-white">
              <div className="h-10 w-10 rounded-lg bg-[#0099A8]/10 text-[#0099A8] flex items-center justify-center shrink-0">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                  Total camps
                </div>
                <div className="text-2xl font-bold text-[#006E7A]">{stats.total}</div>
                <div className="text-xs text-muted-foreground">{stats.active} actius</div>
              </div>
            </Card>

            <Card className="p-4 flex items-center gap-3 border-0 shadow-sm bg-white">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <ListChecks className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                  Camps usats
                </div>
                <div className="text-2xl font-bold text-emerald-700">{stats.usedCount}</div>
                <div className="text-xs text-muted-foreground">
                  {stats.usagePercent}% del diccionari
                </div>
              </div>
            </Card>

            <Card className="p-4 flex items-center gap-3 border-0 shadow-sm bg-white">
              <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Layers className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                  Grups
                </div>
                <div className="text-2xl font-bold text-blue-700">{stats.groups.length}</div>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {stats.groups.slice(0, 2).map((g) => (
                    <Badge key={g} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {g}
                    </Badge>
                  ))}
                  {stats.groups.length > 2 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      +{stats.groups.length - 2}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-4 flex items-center gap-3 border-0 shadow-sm bg-white">
              <div className="h-10 w-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                  Equips
                </div>
                <div className="text-2xl font-bold text-violet-700">{stats.totalEquips}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="text-emerald-600 font-semibold">{stats.equipWithTable}</span> amb
                  taula
                </div>
              </div>
            </Card>

            <Card
              className={`p-4 flex items-center gap-3 border-0 shadow-sm ${
                stats.orphanCount > 0 ? "bg-amber-50 border border-amber-200" : "bg-white"
              }`}
            >
              <div
                className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                  stats.orphanCount > 0
                    ? "bg-amber-100 text-amber-600"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                  Refs. trencades
                </div>
                <div
                  className={`text-2xl font-bold ${
                    stats.orphanCount > 0 ? "text-amber-600" : "text-slate-400"
                  }`}
                >
                  {stats.orphanCount}
                </div>
                <div className="text-xs text-muted-foreground">
                  {stats.orphanCount > 0 ? "camps no trobats" : "tot correcte"}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Taula d'equips */}
        {canSeeView("equips") ? (
          <Card className="p-4 border-0 shadow-sm bg-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#006E7A]">Equips</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Table2 className="h-3.5 w-3.5" />
                <span>
                  {stats.equipWithTable} taules definides · {stats.totalEquips} equips
                </span>
              </div>
            </div>
            <EquipmentsTable />
          </Card>
        ) : (
          /* Missatge si no té accés a cap vista */
          !canSeeView("gubimclass") && !canSeeView("fields") && (
            <Card className="p-12 border-0 shadow-sm bg-white flex flex-col items-center gap-4 text-center">
              <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
                <ShieldOff className="h-7 w-7 text-slate-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-700">Sense accés assignat</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No tens permisos per veure cap secció d'aquesta aplicació.
                  <br />
                  Contacta amb l'administrador.
                </p>
              </div>
            </Card>
          )
        )}
      </main>

      <GubimClassManager open={gubim} onOpenChange={setGubim} />
      <FieldsDictionaryDialog open={dict} onOpenChange={setDict} />
      <UserManagerDialog open={users} onOpenChange={setUsers} />
    </div>
  );
}
