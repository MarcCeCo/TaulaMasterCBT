// src/components/cbt/ControlAgentsPage.tsx
// Pàgina d'administració: Control d'Agents
// Mostra l'última execució de l'agent i la propera data programada
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  RefreshCw,
  XCircle,
  Zap,
  AlertTriangle,
} from "lucide-react";

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface SyncLog {
  id: number;
  executat_a: string;
  sistemes_creats?: number;
  sistemes_actualitzats?: number;
  sistemes_eliminats?: number;
  installacions_creades?: number;
  installacions_actualitzades?: number;
  installacions_eliminades?: number;
  installacions_sense_canvis?: number;
  errors?: number;
  details?: string;
}

interface ApsToken {
  updated_at: string;
  expires_at: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Interpreta el cron "0 2 1 * *" → text llegible
function cronToText(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return schedule;
  const [min, hour, dom, , dow] = parts;

  if (dom !== "*" && dow === "*") {
    const d = parseInt(dom);
    const h = parseInt(hour);
    const m = parseInt(min);
    const suffix = d === 1 ? "er" : `è`;
    return `El dia ${d}${suffix} de cada mes a les ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}h`;
  }
  if (dom === "*" && dow === "*") {
    return `Cada dia a les ${hour}:${String(min).padStart(2, "0")}h`;
  }
  return schedule;
}

// Calcula la propera execució donada la expressió cron
function nextCronDate(schedule: string): Date | null {
  try {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5) return null;
    const [minS, hourS, domS] = parts;
    const min  = parseInt(minS);
    const hour = parseInt(hourS);
    const dom  = parseInt(domS);

    const now = new Date();
    const candidate = new Date(now);

    if (!isNaN(dom)) {
      // El dia N de cada mes
      candidate.setDate(dom);
      candidate.setHours(hour, min, 0, 0);
      if (candidate <= now) {
        candidate.setMonth(candidate.getMonth() + 1);
        candidate.setDate(dom);
        candidate.setHours(hour, min, 0, 0);
      }
    } else {
      // Cada dia
      candidate.setHours(hour, min, 0, 0);
      if (candidate <= now) {
        candidate.setDate(candidate.getDate() + 1);
      }
    }
    return candidate;
  } catch {
    return null;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ca-ES", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `fa ${days} dia${days > 1 ? "s" : ""}`;
  if (hours > 0) return `fa ${hours}h`;
  if (mins > 0)  return `fa ${mins} min`;
  return "ara mateix";
}

function timeUntil(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "imminent";
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `d'aquí ${days} dia${days > 1 ? "s" : ""}`;
  if (hours > 0) return `d'aquí ${hours}h ${mins % 60}min`;
  return `d'aquí ${mins} min`;
}

// ─── Component principal ──────────────────────────────────────────────────────

export function ControlAgentsPage() {
  const [logs, setLogs]           = useState<SyncLog[]>([]);
  const [token, setToken]         = useState<ApsToken | null>(null);
  const [cronSchedule]            = useState("0 2 1 * *"); // llegit de Supabase
  const [loading, setLoading]     = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const agentUrl = import.meta.env.VITE_AGENT_URL as string | undefined;
  const agentSecret = import.meta.env.VITE_AGENT_SECRET as string | undefined;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [logsRes, tokenRes] = await Promise.all([
        supabase
          .from("visor3d_sync_log")
          .select("*")
          .order("executat_a", { ascending: false })
          .limit(10),
        supabase
          .from("aps_tokens")
          .select("updated_at, expires_at")
          .eq("id", 1)
          .single(),
      ]);
      if (logsRes.data)  setLogs(logsRes.data as SyncLog[]);
      if (tokenRes.data) setToken(tokenRes.data as ApsToken);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleTrigger = async () => {
    if (!agentUrl) {
      setTriggerMsg({ ok: false, text: "VITE_AGENT_URL no està configurada." });
      return;
    }
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (agentSecret) headers["Authorization"] = `Bearer ${agentSecret}`;
      const res = await fetch(`${agentUrl}/sync`, { method: "POST", headers });
      if (res.ok) {
        setTriggerMsg({ ok: true, text: "Agent iniciat correctament. Revisa els logs en uns moments." });
        setTimeout(fetchData, 4000);
      } else {
        const body = await res.json().catch(() => ({}));
        setTriggerMsg({ ok: false, text: body?.error ?? `Error ${res.status}` });
      }
    } catch (e) {
      setTriggerMsg({ ok: false, text: "No s'ha pogut connectar amb l'agent." });
    } finally {
      setTriggering(false);
    }
  };

  const lastLog    = logs[0] ?? null;
  const nextRun    = nextCronDate(cronSchedule);
  const tokenOk    = token ? token.expires_at > Date.now() : null;

  return (
    <div className="space-y-6">

      {/* Capçalera */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Control d'Agents</h1>
          <p className="text-sm text-slate-500 mt-1">Estat i gestió de la sincronització amb Autodesk</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-slate-200 text-slate-600 hover:text-[#006E7A] hover:border-[#0099A8]/40"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualitza
        </Button>
      </div>

      {/* Cards de resum */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Última execució */}
        <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-slate-400" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Última execució
            </span>
          </div>
          {loading ? (
            <div className="h-8 bg-slate-100 rounded animate-pulse" />
          ) : lastLog ? (
            <>
              <p className="text-[15px] font-bold text-slate-800 leading-tight">
                {formatDate(lastLog.executat_a)}
              </p>
              <p className="text-[12px] text-slate-400 mt-1">{timeAgo(lastLog.executat_a)}</p>
              <div className="mt-2">
                {!lastLog.errors ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Correcte
                  </Badge>
                ) : (
                  <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] gap-1">
                    <XCircle className="h-3 w-3" /> {lastLog.errors} errors
                  </Badge>
                )}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-slate-400">Sense registres</p>
          )}
        </Card>

        {/* Propera execució */}
        <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <CalendarClock className="h-4 w-4 text-slate-400" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Propera execució
            </span>
          </div>
          {nextRun ? (
            <>
              <p className="text-[15px] font-bold text-slate-800 leading-tight">
                {formatDate(nextRun.toISOString())}
              </p>
              <p className="text-[12px] text-slate-400 mt-1">{timeUntil(nextRun)}</p>
              <p className="text-[11px] text-slate-400 mt-2 font-mono bg-slate-50 px-2 py-1 rounded-lg inline-block">
                {cronToText(cronSchedule)}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-slate-400">No disponible</p>
          )}
        </Card>

        {/* Token Autodesk */}
        <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-slate-400" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Token Autodesk
            </span>
          </div>
          {loading ? (
            <div className="h-8 bg-slate-100 rounded animate-pulse" />
          ) : token ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                {tokenOk ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Actiu
                  </Badge>
                ) : (
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] gap-1">
                    <AlertTriangle className="h-3 w-3" /> Expirat
                  </Badge>
                )}
              </div>
              <p className="text-[12px] text-slate-400 mt-1">
                Renovat: {formatDate(token.updated_at)}
              </p>
              {!tokenOk && (
                <a
                  href={`${agentUrl ?? ""}/auth/login`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#0099A8] hover:underline font-medium"
                >
                  Renova el token →
                </a>
              )}
            </>
          ) : (
            <>
              <p className="text-[13px] text-slate-400 mb-2">Sense token</p>
              <a
                href={`${agentUrl ?? ""}/auth/login`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-[#0099A8] hover:underline font-medium"
              >
                Fes el login Autodesk →
              </a>
            </>
          )}
        </Card>
      </div>

      {/* Executar agent manualment */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[14px] font-semibold text-slate-700">Execució manual</p>
            <p className="text-[12px] text-slate-400 mt-0.5">
              Llança l'agent ara sense esperar la propera execució programada
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 bg-[#0099A8] hover:bg-[#007A87] text-white border-0"
            onClick={handleTrigger}
            disabled={triggering || !agentUrl}
          >
            <Zap className={`h-3.5 w-3.5 ${triggering ? "animate-pulse" : ""}`} />
            {triggering ? "Iniciant..." : "Executa ara"}
          </Button>
        </div>
        {!agentUrl && (
          <p className="mt-3 text-[11px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            Configura <code className="font-mono">VITE_AGENT_URL</code> al fitxer <code className="font-mono">.env.local</code> per habilitar l'execució manual.
          </p>
        )}
        {triggerMsg && (
          <div className={`mt-3 flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg ${
            triggerMsg.ok
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}>
            {triggerMsg.ok
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              : <XCircle className="h-3.5 w-3.5 shrink-0" />}
            {triggerMsg.text}
          </div>
        )}
      </Card>

      {/* Historial de logs */}
      <div>
        <h2 className="text-[13px] font-semibold text-slate-600 mb-3 uppercase tracking-widest">
          Historial d'execucions
        </h2>
        <Card className="border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-[13px]">
              Sense registres d'execució
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Data</th>
                  <th className="text-left px-5 py-3 text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Estat</th>
                  <th className="text-left px-5 py-3 text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 hidden md:table-cell">Canvis</th>
                  <th className="text-left px-5 py-3 text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 hidden lg:table-cell">Missatge</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const isOk = !log.errors;
                  const totalCanvis =
                    (log.sistemes_creats ?? 0) +
                    (log.sistemes_actualitzats ?? 0) +
                    (log.sistemes_eliminats ?? 0) +
                    (log.installacions_creades ?? 0) +
                    (log.installacions_actualitzades ?? 0) +
                    (log.installacions_eliminades ?? 0);

                  return (
                    <tr
                      key={log.id}
                      className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i === 0 ? "bg-slate-50/40" : ""}`}
                    >
                      <td className="px-5 py-3 font-medium text-slate-700 whitespace-nowrap">
                        {formatDate(log.executat_a)}
                        <span className="ml-2 text-slate-400 font-normal">{timeAgo(log.executat_a)}</span>
                      </td>
                      <td className="px-5 py-3">
                        {isOk ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </Badge>
                        ) : (
                          <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] gap-1">
                            <XCircle className="h-3 w-3" /> Error
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-500 hidden md:table-cell">
                        {totalCanvis > 0 ? (
                          <span className="font-medium text-slate-700">{totalCanvis} canvis</span>
                        ) : (
                          <span className="text-slate-400">Sense canvis</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-400 hidden lg:table-cell max-w-xs truncate">
                        {log.details ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
