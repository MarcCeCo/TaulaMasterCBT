// src/components/cbt/ControlAgentsPage.tsx
// Pàgina d'administració: Control d'Agents
// Arquitectura multi-agent: llista a l'esquerra, detall a la dreta.
// Afegir un nou agent = afegir una entrada a AGENTS_CONFIG.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { supabase } from "@/lib/supabase";
import { supaFetch as supa } from "@/lib/supaFetch";
import { useAuth } from "@/lib/auth";
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
  ChevronRight,
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
  detalls?: {
    sistemesCreats?: string[];
    sistemesActualitzats?: string[];
    sistemesEliminats?: string[];
    installacionsCreades?: string[];
    installacionsActualitzades?: string[];
    installacionsEliminades?: string[];
    codisDuplicats?: string[];
    errors?: string[];
  };
}

interface ApsToken {
  updated_at: string;
  expires_at: number;
}

// ─── Configuració d'agents ────────────────────────────────────────────────────
// Per afegir un nou agent, afegeix una entrada aquí.

interface AgentConfig {
  id: string;
  nom: string;
  descripcio: string;
  cronSchedule: string;
  logTable: string;         // taula de Supabase amb els logs
  syncEndpoint: string;     // path de l'endpoint POST per disparar l'agent
  tokenTable?: string;      // opcional: taula amb el token extern (per mostrar estat)
  agentUrlEnv: string;      // nom de la variable d'entorn VITE_ amb la URL base
  agentSecretEnv: string;   // nom de la variable d'entorn VITE_ amb el secret
}

const AGENTS_CONFIG: AgentConfig[] = [
  {
    id: "visor3d",
    nom: "Agent Visor 3D",
    descripcio: "Sincronitza models Revit d'Autodesk Fusion Teams amb la base de dades",
    cronSchedule: "0 6 1 * *",
    logTable: "visor3d_sync_log",
    syncEndpoint: "/sync",
    tokenTable: "aps_tokens",
    agentUrlEnv: "VITE_AGENT_URL",
    agentSecretEnv: "VITE_AGENT_SECRET",
  },
  // Exemple per afegir un segon agent en el futur:
  // {
  //   id: "facturacio",
  //   nom: "Agent Facturació",
  //   descripcio: "Genera informes mensuals de facturació",
  //   cronSchedule: "0 6 1 * *",
  //   logTable: "facturacio_sync_log",
  //   syncEndpoint: "/sync",
  //   agentUrlEnv: "VITE_FACTURACIO_AGENT_URL",
  //   agentSecretEnv: "VITE_FACTURACIO_AGENT_SECRET",
  // },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cronToText(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return schedule;
  const [min, hour, dom, , dow] = parts;
  if (dom !== "*" && dow === "*") {
    const d = parseInt(dom);
    const h = parseInt(hour);
    const m = parseInt(min);
    return `El dia ${d} de cada mes a les ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`;
  }
  if (dom === "*" && dow === "*") {
    return `Cada dia a les ${String(parseInt(hour)).padStart(2, "0")}:${String(parseInt(min)).padStart(2, "0")} UTC`;
  }
  return schedule;
}

function nextCronDate(schedule: string): Date | null {
  try {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5) return null;
    const [minS, hourS, domS] = parts;
    const min  = parseInt(minS);
    const hour = parseInt(hourS);
    const dom  = parseInt(domS);

    // Treballem sempre en UTC per reflectir l'hora real del cron
    const now = new Date();
    const candidate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      isNaN(dom) ? now.getUTCDate() : dom,
      hour,
      min,
      0,
      0,
    ));

    if (candidate <= now) {
      if (!isNaN(dom)) {
        // Avancem un mes i tornem a posar el dia correcte
        candidate.setUTCMonth(candidate.getUTCMonth() + 1);
        candidate.setUTCDate(dom);
      } else {
        candidate.setUTCDate(candidate.getUTCDate() + 1);
      }
    }
    return candidate;
  } catch { return null; }
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

// ─── Subcomponent: llista d'agents (esquerra) ─────────────────────────────────

interface AgentListItemProps {
  agent: AgentConfig;
  lastLog: SyncLog | null;
  selected: boolean;
  onClick: () => void;
}

function AgentListItem({ agent, lastLog, selected, onClick }: AgentListItemProps) {
  const hasError = lastLog ? (lastLog.errors ?? 0) > 0 : false;
  const statusColor = !lastLog
    ? "bg-slate-200"
    : hasError
    ? "bg-red-400"
    : "bg-emerald-400";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 rounded-xl transition-all flex items-center gap-3 group
        ${selected
          ? "bg-[#0099A8]/8 border border-[#0099A8]/20"
          : "border border-transparent hover:bg-slate-50"
        }`}
    >
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors
        ${selected ? "bg-[#0099A8]/10" : "bg-slate-100 group-hover:bg-slate-200"}`}>
        <Bot className={`h-4 w-4 ${selected ? "text-[#0099A8]" : "text-slate-400"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-semibold truncate ${selected ? "text-[#006E7A]" : "text-slate-700"}`}>
          {agent.nom}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2 whitespace-normal">
          {agent.descripcio}
        </p>
        <p className="text-[10px] text-slate-400 mt-1">
          {lastLog ? timeAgo(lastLog.executat_a) : "Sense execucions"}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`h-2 w-2 rounded-full ${statusColor}`} />
        <ChevronRight className={`h-3.5 w-3.5 transition-colors ${selected ? "text-[#0099A8]" : "text-slate-300"}`} />
      </div>
    </button>
  );
}

// ─── Subcomponent: detall de l'agent (dreta) ──────────────────────────────────

interface AgentDetailProps {
  agent: AgentConfig;
  logs: SyncLog[];
  token: ApsToken | null;
  loading: boolean;
  triggering: boolean;
  polling: boolean;
  triggerMsg: { ok: boolean; text: string } | null;
  onTrigger: () => void;
  onRefresh: () => void;
}

function AgentDetail({
  agent, logs, token, loading, triggering, polling, triggerMsg, onTrigger, onRefresh,
}: AgentDetailProps) {
  const agentUrl = (import.meta.env as any)[agent.agentUrlEnv] as string | undefined;
  const lastLog  = logs[0] ?? null;
  const nextRun  = nextCronDate(agent.cronSchedule);
  const tokenOk  = token ? token.expires_at > Date.now() : null;

  return (
    <div className="space-y-5">

      {/* Capçalera */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">{agent.nom}</h2>
          <p className="text-sm text-slate-400 mt-0.5">{agent.descripcio}</p>
        </div>
        <Button
          variant="outline" size="sm"
          className="gap-1.5 border-slate-200 text-slate-600 hover:text-[#006E7A] hover:border-[#0099A8]/40"
          onClick={onRefresh} disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualitza
        </Button>
      </div>

      {/* Cards de resum */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Última execució */}
        <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-slate-400" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Última execució</span>
          </div>
          {loading ? (
            <div className="h-8 bg-slate-100 rounded animate-pulse" />
          ) : lastLog ? (
            <>
              <p className="text-[15px] font-bold text-slate-800 leading-tight">{formatDate(lastLog.executat_a)}</p>
              <p className="text-[12px] text-slate-400 mt-1">{timeAgo(lastLog.executat_a)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {!(lastLog.errors) ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Correcte
                  </Badge>
                ) : (
                  <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] gap-1">
                    <XCircle className="h-3 w-3" /> {lastLog.errors} errors
                  </Badge>
                )}
                {(lastLog.detalls?.codisDuplicats?.length ?? 0) > 0 && (
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] gap-1">
                    <AlertTriangle className="h-3 w-3" /> {lastLog.detalls!.codisDuplicats!.length} codis duplicats
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
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Propera execució</span>
          </div>
          {nextRun ? (
            <>
              <p className="text-[15px] font-bold text-slate-800 leading-tight">{formatDate(nextRun.toISOString())}</p>
              <p className="text-[12px] text-slate-400 mt-1">{timeUntil(nextRun)}</p>
              <p className="text-[11px] text-slate-400 mt-2 font-mono bg-slate-50 px-2 py-1 rounded-lg inline-block">
                {cronToText(agent.cronSchedule)}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-slate-400">No disponible</p>
          )}
        </Card>

        {/* Token extern (opcional) */}
        {agent.tokenTable && (
          <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-slate-400" />
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Token Autodesk</span>
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
                <p className="text-[12px] text-slate-400 mt-1">Renovat: {formatDate(token.updated_at)}</p>
                {!tokenOk && (
                  <a href={`${agentUrl ?? ""}/auth/login`} target="_blank" rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#0099A8] hover:underline font-medium">
                    Renova el token →
                  </a>
                )}
              </>
            ) : (
              <>
                <p className="text-[13px] text-slate-400 mb-2">Sense token</p>
                <a href={`${agentUrl ?? ""}/auth/login`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-[#0099A8] hover:underline font-medium">
                  Fes el login Autodesk →
                </a>
              </>
            )}
          </Card>
        )}
      </div>

      {/* Execució manual */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[14px] font-semibold text-slate-700">Execució manual</p>
            <p className="text-[12px] text-slate-400 mt-0.5">Llança l'agent ara sense esperar la propera execució programada</p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 bg-[#0099A8] hover:bg-[#007A87] text-white border-0"
            onClick={onTrigger}
            disabled={triggering || polling || !agentUrl}
          >
            <Zap className={`h-3.5 w-3.5 ${triggering || polling ? "animate-pulse" : ""}`} />
            {triggering ? "Iniciant..." : polling ? "Executant…" : "Executa ara"}
          </Button>
        </div>
        {polling && (
          <div className="mt-3 flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg bg-blue-50 text-blue-700">
            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
            Sincronització en curs — actualitzant cada 8 s fins que finalitzi…
          </div>
        )}
        {!agentUrl && (
          <p className="mt-3 text-[11px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            Configura <code className="font-mono">{agent.agentUrlEnv}</code> a Vercel per habilitar l'execució manual.
          </p>
        )}
        {triggerMsg && (
          <div className={`mt-3 flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg ${
            triggerMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}>
            {triggerMsg.ok
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              : <XCircle className="h-3.5 w-3.5 shrink-0" />}
            {triggerMsg.text}
          </div>
        )}
      </Card>

      {/* Historial */}
      <div>
        <h3 className="text-[13px] font-semibold text-slate-600 mb-3 uppercase tracking-widest">
          Historial d'execucions
        </h3>
        <Card className="border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-[13px]">Sense registres d'execució</div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Data</th>
                  <th className="text-left px-5 py-3 text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Estat</th>
                  <th className="text-left px-5 py-3 text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 hidden md:table-cell">Canvis</th>
                  <th className="text-left px-5 py-3 text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 hidden lg:table-cell">Detalls</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const isOk = !log.errors;
                  // FIX: només compta canvis reals (creats + actualitzats + eliminats)
                  // Les instal·lacions "sense canvis" (comprovades) no compten
                  const totalCanvis =
                    (log.sistemes_creats             ?? 0) +
                    (log.sistemes_eliminats          ?? 0) +
                    (log.installacions_creades       ?? 0) +
                    (log.installacions_actualitzades ?? 0) +
                    (log.installacions_eliminades    ?? 0);

                  const d = log.detalls;
                  const parts: string[] = [];
                  if (d?.sistemesCreats?.length)            parts.push(`✚ ${d.sistemesCreats.length} sistemes nous`);
                  if (d?.sistemesActualitzats?.length)       parts.push(`✓ ${d.sistemesActualitzats.length} sistemes comprovats`);
                  if (d?.sistemesEliminats?.length)          parts.push(`✕ ${d.sistemesEliminats.length} sistemes eliminats`);
                  if (d?.installacionsCreades?.length)       parts.push(`✚ ${d.installacionsCreades.length} inst. noves`);
                  if (d?.installacionsActualitzades?.length) parts.push(`↻ ${d.installacionsActualitzades.length} inst. actualitzades`);
                  if (d?.installacionsEliminades?.length)    parts.push(`✕ ${d.installacionsEliminades.length} inst. eliminades`);
                  if (d?.installacionsSenseCanvis?.length)   parts.push(`✓ ${d.installacionsSenseCanvis.length} inst. comprovades`);

                  return (
                    <Fragment key={log.id}>
                      <tr className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i === 0 ? "bg-slate-50/40" : ""}`}>
                        <td className="px-5 py-3 font-medium text-slate-700 whitespace-nowrap">
                          {formatDate(log.executat_a)}
                          <span className="ml-2 text-slate-400 font-normal">{timeAgo(log.executat_a)}</span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1">
                            {isOk ? (
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                                <CheckCircle2 className="h-3 w-3" /> OK
                              </Badge>
                            ) : (
                              <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] gap-1">
                                <XCircle className="h-3 w-3" /> {log.errors} errors
                              </Badge>
                            )}
                            {(d?.codisDuplicats?.length ?? 0) > 0 && (
                              <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] gap-1">
                                <AlertTriangle className="h-3 w-3" /> {d!.codisDuplicats!.length} duplicats
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-500 hidden md:table-cell">
                          {totalCanvis > 0
                            ? <span className="font-medium text-slate-700">{totalCanvis} canvis</span>
                            : <span className="text-slate-400">Sense canvis</span>}
                        </td>
                        <td className="px-5 py-3 text-slate-400 hidden lg:table-cell">
                          {parts.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {parts.map((p, pi) => (
                                <span key={pi} className="text-slate-500 leading-snug">{p}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">Sense canvis</span>
                          )}
                          {(d?.codisDuplicats?.length ?? 0) > 0 && (
                            <span className="block mt-1 text-amber-600 text-[11px]">
                              ⚠ {d!.codisDuplicats!.join(", ")}
                            </span>
                          )}
                        </td>
                      </tr>
                      {/* Fila expandida d'errors — visible sempre que n'hi hagi */}
                      {(d?.errors?.length ?? 0) > 0 && (
                        <tr className="border-b border-red-50 bg-red-50/40">
                          <td colSpan={4} className="px-5 py-2">
                            <p className="text-[10.5px] font-semibold text-red-500 uppercase tracking-widest mb-1">
                              Detall d'errors
                            </p>
                            <ul className="space-y-0.5">
                              {d!.errors!.map((e, ei) => (
                                <li key={ei} className="text-[11.5px] text-red-700 font-mono break-all leading-snug">
                                  ❌ {e}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

// ─── Component principal ──────────────────────────────────────────────────────

export function ControlAgentsPage() {
  const { getToken, loading: authLoading, user } = useAuth();

  const [selectedAgentId, setSelectedAgentId] = useState<string>(AGENTS_CONFIG[0].id);
  const [logsPerAgent, setLogsPerAgent]     = useState<Record<string, SyncLog[]>>({});
  const [tokenPerAgent, setTokenPerAgent]   = useState<Record<string, ApsToken | null>>({});
  const [loading, setLoading]               = useState(true);
  const [triggering, setTriggering]         = useState(false);
  const [triggerMsg, setTriggerMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  const loadingRef        = useRef(false);
  const needsReloadRef    = useRef(false);
  const pollRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const pollAgentIdRef    = useRef<string>("");   // evita closure estale dins setInterval
  const pollLastIdRef     = useRef<number>(0);    // id del log conegut en el moment de disparar
  const [polling, setPolling] = useState(false);

  const selectedAgent = AGENTS_CONFIG.find(a => a.id === selectedAgentId) ?? AGENTS_CONFIG[0];

  // ── Fetch dades de tots els agents ────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    let tok = getToken();
    if (!tok) {
      const { data: { session } } = await supabase.auth.getSession();
      tok = session?.access_token ?? "";
    }
    if (!tok) {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const { data: { session } } = await supabase.auth.getSession();
        tok = session?.access_token ?? "";
        if (tok) break;
      }
    }
    if (!tok) {
      setLoading(false);
      loadingRef.current = false;
      return;
    }

    try {
      const results = await Promise.all(
        AGENTS_CONFIG.map(async (agent) => {
          const logsData = await supa(
            tok!,
            "GET",
            `${agent.logTable}?select=*&order=executat_a.desc&limit=10`
          ).catch(() => []);

          let tokenData: ApsToken | null = null;
          if (agent.tokenTable) {
            const td = await supa(
              tok!,
              "GET",
              `${agent.tokenTable}?select=updated_at,expires_at&id=eq.1`
            ).catch(() => []);
            tokenData = (td[0] as ApsToken) ?? null;
          }

          return { id: agent.id, logs: logsData as SyncLog[], token: tokenData };
        })
      );

      const newLogs: Record<string, SyncLog[]>      = {};
      const newTokens: Record<string, ApsToken | null> = {};
      results.forEach(r => {
        newLogs[r.id]   = r.logs;
        newTokens[r.id] = r.token;
      });
      setLogsPerAgent(newLogs);
      setTokenPerAgent(newTokens);
    } catch {
      // silent
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [getToken]);

  useEffect(() => {
    if (!authLoading && user) fetchAll();
  }, [authLoading, user, fetchAll]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN")       setTimeout(() => fetchAll(), 50);
      if (event === "TOKEN_REFRESHED") {
        if (document.hidden) needsReloadRef.current = true;
        else fetchAll();
      }
      if (event === "SIGNED_OUT") {
        setLogsPerAgent({});
        setTokenPerAgent({});
        setLoading(false);
        loadingRef.current = false;
      }
    });
    const handleVisibility = () => {
      if (!document.hidden && needsReloadRef.current && !pollRef.current) {
        needsReloadRef.current = false;
        fetchAll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
      if (pollRef.current)        clearInterval(pollRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [fetchAll]);

  // ── Execució manual ───────────────────────────────────────────────────────

  const handleTrigger = async () => {
    const agentUrl    = (import.meta.env as any)[selectedAgent.agentUrlEnv] as string | undefined;
    const agentSecret = (import.meta.env as any)[selectedAgent.agentSecretEnv] as string | undefined;

    if (!agentUrl) {
      setTriggerMsg({ ok: false, text: `${selectedAgent.agentUrlEnv} no està configurada.` });
      return;
    }
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (agentSecret) headers["Authorization"] = `Bearer ${agentSecret}`;
      const res = await fetch(`${agentUrl}${selectedAgent.syncEndpoint}`, { method: "POST", headers });
      if (res.ok) {
        setTriggerMsg({ ok: true, text: "Agent iniciat. Esperant el resultat (pot trigar uns minuts)…" });

        // Guardem l'id del darrer log conegut per detectar quan n'arriba un de nou
        const lastKnownId = (logsPerAgent[selectedAgent.id] ?? [])[0]?.id ?? 0;

        // Neteja qualsevol polling anterior
        if (pollRef.current)        clearInterval(pollRef.current);
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);

        pollAgentIdRef.current  = selectedAgent.id;
        pollLastIdRef.current   = lastKnownId;
        setPolling(true);

        const stopPolling = () => {
          if (pollRef.current)        { clearInterval(pollRef.current);  pollRef.current = null; }
          if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
          setPolling(false);
        };

        pollRef.current = setInterval(async () => {
          await fetchAll();
          setLogsPerAgent(prev => {
            // Usem els refs — no valors capturats pel closure
            const agId   = pollAgentIdRef.current;
            const lastId = pollLastIdRef.current;
            const newest = (prev[agId] ?? [])[0];
            if (newest && newest.id !== lastId) {
              stopPolling();
              setTriggerMsg(
                newest.errors
                  ? { ok: false, text: `Execució finalitzada amb ${newest.errors} error(s). Revisa els detalls a l'historial.` }
                  : { ok: true,  text: "Execució finalitzada correctament." }
              );
            }
            return prev;
          });
        }, 8000);

        // Para el polling com a molt als 10 min (l'agent pot haver fallat silenciosament)
        pollTimeoutRef.current = setTimeout(() => {
          stopPolling();
          setTriggerMsg({ ok: false, text: "Temps d'espera superat (>10 min). Comprova els logs manualment." });
        }, 10 * 60 * 1000);

      } else {
        const body = await res.json().catch(() => ({}));
        setTriggerMsg({ ok: false, text: body?.error ?? `Error ${res.status}` });
      }
    } catch {
      setTriggerMsg({ ok: false, text: "No s'ha pogut connectar amb l'agent." });
    } finally {
      setTriggering(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Capçalera de la pàgina */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Control d'Agents</h1>
        <p className="text-sm text-slate-500 mt-1">Estat i gestió de la sincronització amb serveis externs</p>
      </div>

      {/* Layout: llista esquerra + detall dreta */}
      <div className="flex gap-5 items-start">

        {/* Llista d'agents */}
        <div className="w-64 shrink-0">
          <Card className="p-2 border-slate-100 shadow-sm bg-white rounded-2xl">
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 px-3 pt-2 pb-1">
              Agents ({AGENTS_CONFIG.length})
            </p>
            <div className="space-y-0.5">
              {AGENTS_CONFIG.map(agent => (
                <AgentListItem
                  key={agent.id}
                  agent={agent}
                  lastLog={(logsPerAgent[agent.id] ?? [])[0] ?? null}
                  selected={selectedAgentId === agent.id}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    // No neteges el missatge si hi ha polling en curs
                    if (!pollRef.current) setTriggerMsg(null);
                  }}
                />
              ))}
            </div>
          </Card>
        </div>

        {/* Detall de l'agent seleccionat */}
        <div className="flex-1 min-w-0">
          <AgentDetail
            agent={selectedAgent}
            logs={logsPerAgent[selectedAgent.id] ?? []}
            token={tokenPerAgent[selectedAgent.id] ?? null}
            loading={loading}
            triggering={triggering}
            polling={polling}
            triggerMsg={triggerMsg}
            onTrigger={handleTrigger}
            onRefresh={fetchAll}
          />
        </div>
      </div>
    </div>
  );
}
