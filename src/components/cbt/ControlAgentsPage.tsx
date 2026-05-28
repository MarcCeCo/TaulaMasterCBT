// src/components/cbt/ControlAgentsPage.tsx
// Pàgina d'administració: Control d'Agents
//
// Agents:
//   1. visor3d      — Sincronitza models Revit d'ACC → Supabase
//   2. bimSync      — Dues accions independents:
//                       · Copiar disciplines (Desktop Connector → USB)
//                       · Pujar MASTERs (USB → ACC + xRefs + processament)
//   3. crearMasters — Panell informatiu + descàrrega script pyRevit
//                     Instruccions del flux complet BIM
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
  HardDrive,
  FolderOpen,
  Download,
  Copy,
  ArrowRight,
  Info,
  Link2,
  Upload,
  FolderSync,
} from "lucide-react";

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface SyncLog {
  id: number;
  executat_a: string;
  // Visor 3D
  sistemes_creats?: number;
  sistemes_actualitzats?: number;
  sistemes_eliminats?: number;
  installacions_creades?: number;
  installacions_actualitzades?: number;
  installacions_eliminades?: number;
  installacions_sense_canvis?: number;
  // BIM Sync
  opcio?: string;
  fitxers_processats?: number;
  fitxers_copiats?: number;
  fitxers_pujats?: number;
  xrefs_registrats?: number;
  errors?: number;
  detalls?: {
    sistemesCreats?: string[];
    sistemesActualitzats?: string[];
    sistemesEliminats?: string[];
    installacionsCreades?: string[];
    installacionsActualitzades?: string[];
    installacionsEliminades?: string[];
    installacionsSenseCanvis?: string[];
    codisDuplicats?: string[];
    fitxersCopiats?: string[];
    fitxersAmbError?: string[];
    errors?: string[];
  };
}

interface ApsToken {
  updated_at: string;
  expires_at: number;
}

// ─── Configuració d'agents ────────────────────────────────────────────────────

interface AgentConfig {
  id: string;
  nom: string;
  descripcio: string;
  icon: React.ReactNode;
  cronSchedule: string;
  logTable: string | null;   // null = agent sense logs (ex: crearMasters)
  syncEndpoint: string | null;
  tokenTable?: string;
  agentUrlEnv: string;
  agentSecretEnv: string;
}

const AGENTS_CONFIG: AgentConfig[] = [
  {
    id: "visor3d",
    nom: "Agent Visor 3D",
    descripcio: "Sincronitza models Revit d'Autodesk Fusion Teams amb la base de dades",
    icon: <Bot className="h-4 w-4" />,
    cronSchedule: "0 6 1 * *",
    logTable: "visor3d_sync_log",
    syncEndpoint: "/sync",
    tokenTable: "aps_tokens",
    agentUrlEnv: "VITE_AGENT_URL",
    agentSecretEnv: "VITE_AGENT_SECRET",
  },
  {
    id: "bimSync",
    nom: "Agent BIM Sync",
    descripcio: "Copia disciplines al USB i puja MASTERs a ACC amb xRefs",
    icon: <HardDrive className="h-4 w-4" />,
    cronSchedule: "0 7 1 * *",
    logTable: "bim_sync_log",
    syncEndpoint: "/bim-sync",
    agentUrlEnv: "VITE_AGENT_URL",
    agentSecretEnv: "VITE_AGENT_SECRET",
  },
  {
    id: "crearMasters",
    nom: "Crear Masters CBT",
    descripcio: "Script pyRevit per crear fitxers MASTER a partir de disciplines BIM",
    icon: <FolderOpen className="h-4 w-4" />,
    cronSchedule: "",
    logTable: null,
    syncEndpoint: null,
    agentUrlEnv: "",
    agentSecretEnv: "",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cronToText(schedule: string): string {
  if (!schedule) return "Manual";
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return schedule;
  const [min, hour, dom, , dow] = parts;
  if (dom !== "*" && dow === "*") {
    return `El dia ${parseInt(dom)} de cada mes a les ${String(parseInt(hour)).padStart(2, "0")}:${String(parseInt(min)).padStart(2, "0")} UTC`;
  }
  return schedule;
}

function nextCronDate(schedule: string): Date | null {
  if (!schedule) return null;
  try {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5) return null;
    const min  = parseInt(parts[0]);
    const hour = parseInt(parts[1]);
    const dom  = parseInt(parts[2]);
    const now  = new Date();
    const candidate = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(),
      isNaN(dom) ? now.getUTCDate() : dom,
      hour, min, 0, 0,
    ));
    if (candidate <= now) {
      if (!isNaN(dom)) { candidate.setUTCMonth(candidate.getUTCMonth() + 1); candidate.setUTCDate(dom); }
      else { candidate.setUTCDate(candidate.getUTCDate() + 1); }
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
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `fa ${days} ${days > 1 ? "dies" : "dia"}`;
  if (hours > 0) return `fa ${hours}h`;
  if (mins > 0)  return `fa ${mins} min`;
  return "ara mateix";
}

function timeUntil(date: Date): string {
  const diff  = date.getTime() - Date.now();
  if (diff <= 0) return "imminent";
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `d'aquí ${days} ${days > 1 ? "dies" : "dia"}`;
  if (hours > 0) return `d'aquí ${hours}h ${mins % 60}min`;
  return `d'aquí ${mins} min`;
}

// ─── Subcomponent: element de la llista ───────────────────────────────────────

interface AgentListItemProps {
  agent:    AgentConfig;
  lastLog:  SyncLog | null;
  selected: boolean;
  onClick:  () => void;
}

function AgentListItem({ agent, lastLog, selected, onClick }: AgentListItemProps) {
  const isInfoOnly  = !agent.logTable;
  const hasError    = lastLog ? (lastLog.errors ?? 0) > 0 : false;
  const statusColor = isInfoOnly
    ? "bg-violet-400"
    : !lastLog
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
          : "border border-transparent hover:bg-slate-50"}`}
    >
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors
        ${selected ? "bg-[#0099A8]/10" : "bg-slate-100 group-hover:bg-slate-200"}`}>
        <span className={selected ? "text-[#0099A8]" : "text-slate-500"}>{agent.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-slate-800 truncate">{agent.nom}</span>
          <span className={`h-2 w-2 rounded-full shrink-0 ${statusColor}`} />
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
          {isInfoOnly
            ? "Script local · pyRevit"
            : lastLog
            ? timeAgo(lastLog.executat_a)
            : "Sense execucions"}
        </p>
      </div>
      <ChevronRight className={`h-4 w-4 shrink-0 transition-colors
        ${selected ? "text-[#0099A8]/60" : "text-slate-300 group-hover:text-slate-400"}`} />
    </button>
  );
}

// ─── Pas numerado (per a instruccions) ───────────────────────────────────────

function Pas({
  num, titol, children, icon,
}: {
  num: number; titol: string; children: React.ReactNode; icon?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="h-7 w-7 rounded-full bg-[#0099A8]/10 text-[#0099A8] flex items-center justify-center text-xs font-bold">
          {num}
        </div>
        <div className="flex-1 w-px bg-slate-100" />
      </div>
      <div className="pb-5 min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          {icon && <span className="text-[#0099A8]">{icon}</span>}
          <p className="font-semibold text-sm text-slate-700">{titol}</p>
        </div>
        <div className="text-[12.5px] text-slate-500 leading-relaxed space-y-1">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Codi inline ─────────────────────────────────────────────────────────────

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-100 text-slate-700
        px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200 transition-colors group"
      onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      title="Copia"
    >
      {children}
      <Copy className="h-2.5 w-2.5 text-slate-400 group-hover:text-slate-600 shrink-0" />
      {copied && <span className="text-emerald-600 text-[10px]">✓</span>}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANELL VISOR 3D
// ═══════════════════════════════════════════════════════════════════════════════

interface Visor3DPanelProps {
  agent:      AgentConfig;
  logs:       SyncLog[];
  token:      ApsToken | null;
  loading:    boolean;
  triggering: boolean;
  polling:    boolean;
  triggerMsg: { ok: boolean; text: string } | null;
  onTrigger:  () => void;
  onRefresh:  () => void;
}

function Visor3DPanel({
  agent, logs, token, loading, triggering, polling, triggerMsg, onTrigger, onRefresh,
}: Visor3DPanelProps) {
  const nextRun = nextCronDate(agent.cronSchedule);
  const lastLog = logs[0] ?? null;

  return (
    <div className="space-y-4">
      {/* Capçalera */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-[#0099A8]/10 flex items-center justify-center text-[#0099A8]">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 text-base">{agent.nom}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{agent.descripcio}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}
            className="text-slate-400 hover:text-slate-600 shrink-0">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-50 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-widest text-slate-400">Programació</p>
            <p className="text-sm font-medium text-slate-700 mt-1 flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
              {cronToText(agent.cronSchedule)}
            </p>
          </div>
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-widest text-slate-400">Pròxima execució</p>
            <p className="text-sm font-medium text-slate-700 mt-1 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              {nextRun ? timeUntil(nextRun) : "—"}
            </p>
          </div>
          {lastLog && (
            <div>
              <p className="text-[10.5px] font-medium uppercase tracking-widest text-slate-400">Darrera execució</p>
              <div className="mt-1 flex items-center gap-1.5">
                {(lastLog.errors ?? 0) > 0
                  ? <XCircle className="h-3.5 w-3.5 text-red-500" />
                  : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                <span className="text-sm font-medium text-slate-700">{timeAgo(lastLog.executat_a)}</span>
              </div>
            </div>
          )}
        </div>

        {token && (
          <div className="mt-3 pt-3 border-t border-slate-50">
            <p className="text-[10.5px] font-medium uppercase tracking-widest text-slate-400 mb-1">Token APS</p>
            <div className="flex items-center gap-2">
              {token.expires_at > Date.now()
                ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> Vàlid · expira {timeUntil(new Date(token.expires_at))}</Badge>
                : <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] gap-1"><XCircle className="h-3 w-3" /> Expirat</Badge>}
            </div>
          </div>
        )}
      </Card>

      {/* Execució manual */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Execució manual</p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={onTrigger} disabled={triggering || polling}
            className="bg-[#0099A8] hover:bg-[#007a88] text-white gap-2 rounded-xl h-9 px-5 text-sm shadow-sm">
            <Zap className={`h-3.5 w-3.5 ${triggering || polling ? "animate-pulse" : ""}`} />
            {triggering ? "Iniciant…" : polling ? "Executant…" : "Executar ara"}
          </Button>
          {polling && (
            <div className="flex items-center gap-2 text-[#0099A8] text-xs">
              <div className="h-3.5 w-3.5 rounded-full border-2 border-[#0099A8] border-t-transparent animate-spin" />
              Esperant resultat en temps real…
            </div>
          )}
        </div>
        {triggerMsg && (
          <div className={`mt-3 px-4 py-2.5 rounded-xl text-sm flex items-start gap-2
            ${triggerMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {triggerMsg.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
            {triggerMsg.text}
          </div>
        )}
      </Card>

      {/* Historial */}
      <LogsTable agent={agent} logs={logs} loading={loading} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANELL BIM SYNC — dos botons independents
// ═══════════════════════════════════════════════════════════════════════════════

interface BimSyncPanelProps {
  agent:       AgentConfig;
  logs:        SyncLog[];
  loading:     boolean;
  triggering:  string | null;   // "copiar" | "pujar" | null
  polling:     boolean;
  triggerMsg:  { ok: boolean; text: string } | null;
  onTrigger:   (opcio: "copiar-disciplines" | "pujar-masters") => void;
  onRefresh:   () => void;
}

function BimSyncPanel({
  agent, logs, loading, triggering, polling, triggerMsg, onTrigger, onRefresh,
}: BimSyncPanelProps) {
  const nextRun = nextCronDate(agent.cronSchedule);
  const lastLog = logs[0] ?? null;

  return (
    <div className="space-y-4">
      {/* Capçalera */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-[#0099A8]/10 flex items-center justify-center text-[#0099A8]">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 text-base">{agent.nom}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{agent.descripcio}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}
            className="text-slate-400 hover:text-slate-600 shrink-0">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-50 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-widest text-slate-400">Programació</p>
            <p className="text-sm font-medium text-slate-700 mt-1 flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
              {cronToText(agent.cronSchedule)}
            </p>
          </div>
          <div>
            <p className="text-[10.5px] font-medium uppercase tracking-widest text-slate-400">Pròxima</p>
            <p className="text-sm font-medium text-slate-700 mt-1 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              {nextRun ? timeUntil(nextRun) : "—"}
            </p>
          </div>
          {lastLog && (
            <div>
              <p className="text-[10.5px] font-medium uppercase tracking-widest text-slate-400">Darrera</p>
              <div className="mt-1 flex items-center gap-1.5">
                {(lastLog.errors ?? 0) > 0
                  ? <XCircle className="h-3.5 w-3.5 text-red-500" />
                  : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                <span className="text-sm font-medium text-slate-700">{timeAgo(lastLog.executat_a)}</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Avís de configuració USB */}
      <Card className="p-4 border-amber-200 bg-amber-50 rounded-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-[12px] text-amber-800 space-y-1.5 leading-relaxed">
            <p className="font-semibold text-amber-900">Requisit: Agent local + USB connectat</p>
            <p>
              L'opció <strong>Pujar MASTERs</strong> requereix que l'agent s'executi a l'ordinador
              on tens el USB connectat (no a Render/cloud). Configura la variable d'entorn:
            </p>
            <div className="font-mono bg-amber-100 rounded-lg px-3 py-1.5 text-[11px] text-amber-900 border border-amber-200">
              <span className="text-amber-600">BIM_USB_PATH</span> = <span className="text-amber-800">F:\BIM_WORK</span>
            </div>
            <p className="text-amber-700">
              Si veus l'error <em>"El directori USB no existeix"</em>, comprova que el USB
              està connectat i que la lletra/ruta de <Code>BIM_USB_PATH</Code> és correcta
              al fitxer <Code>.env</Code> de l'agent local.
            </p>
          </div>
        </div>
      </Card>

      {/* Instruccions d'ús */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-[#0099A8]" />
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Com funciona</p>
        </div>
        <div className="space-y-0">
          <Pas num={1} titol="Prepara el disc USB" icon={<HardDrive className="h-3.5 w-3.5" />}>
            <p>Connecta el disc USB a l'ordinador on tens el <strong>Desktop Connector</strong> amb els fitxers d'ACC sincronitzats localment.</p>
            <p>Assegura't que la variable <Code>BIM_USB_PATH</Code> apunta a la carpeta <Code>BIM_WORK</Code> del USB (configura-la a les variables d'entorn de l'agent).</p>
          </Pas>
          <Pas num={2} titol="Copiar disciplines al USB" icon={<FolderSync className="h-3.5 w-3.5" />}>
            <p>Prem <strong>Copiar disciplines</strong>. L'agent busca recursivament tots els fitxers <Code>_ENT</Code>, <Code>_EST</Code> i <Code>_MEP</Code> a la carpeta origen del Desktop Connector i els copia al USB, mantenint l'estructura de carpetes relativa.</p>
            <p>Els fitxers ja actualitzats es salten automàticament (comparació per data de modificació).</p>
          </Pas>
          <Pas num={3} titol="Porta el USB a l'altra màquina" icon={<ArrowRight className="h-3.5 w-3.5" />}>
            <p>Mou el USB a l'ordinador des d'on vols pujar a ACC (pot ser el mateix o un de diferent). No cal cap programa especial: l'agent s'encarrega de tot via API.</p>
          </Pas>
          <Pas num={4} titol="Pujar MASTERs a ACC" icon={<Upload className="h-3.5 w-3.5" />}>
            <p>Prem <strong>Pujar MASTERs</strong>. Per a cada fitxer <Code>_MASTER.rvt</Code> del USB, l'agent:</p>
            <p>① Puja el fitxer a la carpeta <Code>001_MODEL-BIM</Code> corresponent a ACC.</p>
            <p>② Registra les <strong>xRefs</strong> (vincles entre el MASTER i les disciplines) via <Code>POST /versions?copyFrom</Code>.</p>
            <p>③ ACC inicia el <strong>processament automàtic</strong> (traducció SVF2 per al visor 3D). No cal entrar manualment a cada fitxer.</p>
          </Pas>
          <Pas num={5} titol="Comprova l'estat" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            <p>L'historial de sota registra cada execució amb el nombre de fitxers pujats, xRefs registrats i errors. En cas d'error, els detalls apareixen expandits a la taula.</p>
          </Pas>
        </div>
      </Card>

      {/* Accions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Botó 1: Copiar disciplines */}
        <Card className="p-4 border-slate-100 shadow-sm bg-white rounded-2xl">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
              <FolderSync className="h-4 w-4 text-sky-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-slate-800">Copiar disciplines</p>
              <p className="text-[11.5px] text-slate-500 mt-0.5 leading-snug">
                Desktop Connector → USB<br />
                Copia <Code>_ENT</Code> <Code>_EST</Code> <Code>_MEP</Code>
              </p>
            </div>
          </div>
          <Button
            onClick={() => onTrigger("copiar-disciplines")}
            disabled={!!triggering || polling}
            variant="outline"
            className="w-full rounded-xl h-9 text-sm border-sky-200 text-sky-700 hover:bg-sky-50 gap-2">
            {triggering === "copiar" ? (
              <><div className="h-3.5 w-3.5 rounded-full border-2 border-sky-600 border-t-transparent animate-spin" /> Copiant…</>
            ) : (
              <><FolderSync className="h-3.5 w-3.5" /> Copiar disciplines</>
            )}
          </Button>
        </Card>

        {/* Botó 2: Pujar MASTERs */}
        <Card className="p-4 border-slate-100 shadow-sm bg-white rounded-2xl">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl bg-[#0099A8]/10 flex items-center justify-center shrink-0">
              <Upload className="h-4 w-4 text-[#0099A8]" />
            </div>
            <div>
              <p className="font-semibold text-sm text-slate-800">Pujar MASTERs</p>
              <p className="text-[11.5px] text-slate-500 mt-0.5 leading-snug">
                USB → ACC + xRefs<br />
                Registra vincles i dispara processament
              </p>
            </div>
          </div>
          <Button
            onClick={() => onTrigger("pujar-masters")}
            disabled={!!triggering || polling}
            className="w-full bg-[#0099A8] hover:bg-[#007a88] text-white rounded-xl h-9 text-sm gap-2">
            {triggering === "pujar" ? (
              <><div className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Pujant…</>
            ) : polling ? (
              <><div className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Esperant…</>
            ) : (
              <><Upload className="h-3.5 w-3.5" /> Pujar MASTERs</>
            )}
          </Button>
        </Card>
      </div>

      {triggerMsg && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-start gap-2
          ${triggerMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {triggerMsg.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          {triggerMsg.text}
        </div>
      )}

      {/* Historial */}
      <LogsTable agent={agent} logs={logs} loading={loading} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANELL CREAR MASTERS — informatiu + descàrrega
// ═══════════════════════════════════════════════════════════════════════════════

const SCRIPT_PATH_PYREVIT =
  "%APPDATA%\\pyRevit-Master\\Extensions\\CBT.extension\\CBT.tab\\CBT Tools.panel\\Crear Masters.pushbutton\\script.py";

function CrearMastersPanel() {
  const [copied, setCopied] = useState(false);

  function handleDownload() {
    // L'script es serveix des de /public/scripts/script.py
    const a = document.createElement("a");
    a.href = "/scripts/script.py";
    a.download = "script.py";
    a.click();
  }

  function handleCopyPath() {
    navigator.clipboard.writeText(SCRIPT_PATH_PYREVIT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Capçalera */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-11 w-11 rounded-xl bg-violet-50 flex items-center justify-center text-violet-500">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 text-base">Crear Masters CBT</h2>
            <p className="text-xs text-slate-500 mt-0.5">Script pyRevit · s'executa dins de Revit</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-50">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-violet-50 text-violet-700 border-violet-200 text-[10px]">Script local</Badge>
            <Badge className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">pyRevit + Revit 2024+</Badge>
            <Badge className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">IronPython 3</Badge>
          </div>
        </div>
      </Card>

      {/* Descàrrega */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Script</p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleDownload}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-2 rounded-xl h-9 px-5 text-sm shadow-sm">
            <Download className="h-3.5 w-3.5" />
            Descarregar script.py
          </Button>
          <Button variant="outline" onClick={handleCopyPath}
            className="gap-2 rounded-xl h-9 px-4 text-sm border-slate-200 text-slate-600 hover:bg-slate-50">
            {copied ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Copiat!</> : <><Copy className="h-3.5 w-3.5" /> Copia la ruta de destí</>}
          </Button>
        </div>
        <p className="text-[11.5px] text-slate-400 mt-3 font-mono leading-relaxed break-all">
          {SCRIPT_PATH_PYREVIT}
        </p>
      </Card>

      {/* Instruccions del flux complet */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-violet-500" />
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Flux complet BIM — pas a pas</p>
        </div>
        <div className="space-y-0">
          <Pas num={1} titol="Instal·la l'script a pyRevit" icon={<Download className="h-3.5 w-3.5" />}>
            <p>Descarrega <Code>script.py</Code> i copia'l a la ruta de pyRevit indicada a sobre (botó <em>Copia la ruta de destí</em>).</p>
            <p>A Revit, ves a la pestanya <strong>CBT → CBT Tools → Crear Masters</strong>. Si no apareix, fes <em>pyRevit → Reload</em>.</p>
          </Pas>
          <Pas num={2} titol="Prepara la plantilla CBT" icon={<FolderOpen className="h-3.5 w-3.5" />}>
            <p>Col·loca el fitxer <Code>CBT_PLANTILLA.rte</Code> a <Code>Documents\</Code> o al costat dels fitxers RVT. L'script el troba automàticament.</p>
            <p>Estructura de carpetes esperada:</p>
            <pre className="bg-slate-50 rounded-lg px-3 py-2 text-[10.5px] font-mono text-slate-600 overflow-x-auto mt-1">{`carpeta_arrel/
  001_GRANOLLERS/
    ED008_CALDES-DE-MONTBUI/
      001_MODEL-BIM/
        ED008_..._ENT.rvt
        ED008_..._EST.ZonaA.rvt
        ED008_..._MEP.rvt`}</pre>
          </Pas>
          <Pas num={3} titol="Executa l'script des de Revit" icon={<Zap className="h-3.5 w-3.5" />}>
            <p>Fes clic a <strong>Crear Masters</strong> a la barra de pyRevit. L'script detecta automàticament totes les instal·lacions a la carpeta que seleccionis.</p>
            <p>Per a cada instal·lació:</p>
            <p>① Obre la plantilla <Code>.rte</Code> en segon pla.</p>
            <p>② Vincula els fitxers <Code>_ENT</Code>, <Code>_EST</Code> i <Code>_MEP</Code> (incloses les zones A, B, etc.).</p>
            <p>③ Crea la vista 3D <Code>TAULA-MASTER</Code> i la publica.</p>
            <p>④ Desa com a <Code>ED008_CALDES-DE-MONTBUI_MASTER.rvt</Code>.</p>
          </Pas>
          <Pas num={4} titol="Copia les disciplines al USB" icon={<HardDrive className="h-3.5 w-3.5" />}>
            <p>Un cop creats els MASTERs, usa l'<strong>Agent BIM Sync → Copiar disciplines</strong> per copiar tots els fitxers <Code>_ENT/_EST/_MEP</Code> del Desktop Connector al USB, mantenint l'estructura de carpetes.</p>
          </Pas>
          <Pas num={5} titol="Puja els MASTERs a ACC" icon={<Upload className="h-3.5 w-3.5" />}>
            <p>Usa l'<strong>Agent BIM Sync → Pujar MASTERs</strong> per pujar els fitxers <Code>_MASTER.rvt</Code> del USB a ACC. L'agent registra automàticament les xRefs (vincles entre el MASTER i les disciplines) i dispara el processament a ACC.</p>
            <p><strong>Important:</strong> els fitxers de disciplina han d'estar a la <strong>mateixa carpeta</strong> <Code>001_MODEL-BIM</Code> d'ACC que el MASTER. ACC resol els vincles pel nom del fitxer.</p>
          </Pas>
          <Pas num={6} titol="Verifica al Visor 3D" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            <p>Al cap de pocs minuts, ACC hauria de tenir el model federat disponible. L'<strong>Agent Visor 3D</strong> sincronitza els URNs amb Supabase perquè apareguin al visor de la plataforma.</p>
            <p>Si el model no apareix, comprova l'estat de traducció a <strong>ACC → Documents</strong> i revisa els errors a l'historial de l'Agent BIM Sync.</p>
          </Pas>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAULA DE LOGS (compartida per Visor 3D i BIM Sync)
// ═══════════════════════════════════════════════════════════════════════════════

function LogsTable({ agent, logs, loading }: { agent: AgentConfig; logs: SyncLog[]; loading: boolean }) {
  return (
    <Card className="border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-50">
        <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">
          Historial ({logs.length})
        </p>
      </div>
      {loading && !logs.length ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">Carregant…</div>
      ) : !logs.length ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">Cap execució registrada</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Data</th>
                <th className="px-5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Estat</th>
                <th className="px-5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 hidden md:table-cell">Canvis</th>
                <th className="px-5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 hidden lg:table-cell">Detall</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const isOk  = !log.errors;
                const d     = log.detalls;
                const parts: string[] = [];
                let totalCanvis = 0;

                if (agent.id === "visor3d") {
                  totalCanvis =
                    (log.sistemes_creats ?? 0) + (log.sistemes_eliminats ?? 0) +
                    (log.installacions_creades ?? 0) + (log.installacions_actualitzades ?? 0) +
                    (log.installacions_eliminades ?? 0);
                  if (d?.sistemesCreats?.length)            parts.push(`✚ ${d.sistemesCreats.length} sistemes nous`);
                  if (d?.sistemesActualitzats?.length)       parts.push(`✓ ${d.sistemesActualitzats.length} sistemes`);
                  if (d?.sistemesEliminats?.length)          parts.push(`✕ ${d.sistemesEliminats.length} sistemes eliminats`);
                  if (d?.installacionsCreades?.length)       parts.push(`✚ ${d.installacionsCreades.length} inst. noves`);
                  if (d?.installacionsActualitzades?.length) parts.push(`↻ ${d.installacionsActualitzades.length} inst. actualitzades`);
                  if (d?.installacionsEliminades?.length)    parts.push(`✕ ${d.installacionsEliminades.length} inst. eliminades`);
                  if (d?.installacionsSenseCanvis?.length)   parts.push(`✓ ${d.installacionsSenseCanvis.length} sense canvis`);
                } else if (agent.id === "bimSync") {
                  totalCanvis = (log.fitxers_pujats ?? 0) + (log.fitxers_copiats ?? 0);
                  if (log.opcio)                    parts.push(`Opció: ${log.opcio}`);
                  if (log.fitxers_copiats)          parts.push(`→ ${log.fitxers_copiats} fitxers copiats`);
                  if (log.fitxers_pujats)           parts.push(`↑ ${log.fitxers_pujats} pujats a ACC`);
                  if (log.xrefs_registrats)         parts.push(`🔗 ${log.xrefs_registrats} xRefs`);
                  if (d?.fitxersAmbError?.length)   parts.push(`⚠ ${d.fitxersAmbError.length} errors`);
                }

                return (
                  <Fragment key={log.id}>
                    <tr className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i === 0 ? "bg-slate-50/40" : ""}`}>
                      <td className="px-5 py-3 font-medium text-slate-700 whitespace-nowrap">
                        {formatDate(log.executat_a)}
                        <span className="ml-2 text-slate-400 font-normal text-xs">{timeAgo(log.executat_a)}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {isOk
                            ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> OK</Badge>
                            : <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] gap-1"><XCircle className="h-3 w-3" /> {log.errors} errors</Badge>}
                          {(d?.codisDuplicats?.length ?? 0) > 0 && (
                            <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] gap-1">
                              <AlertTriangle className="h-3 w-3" /> {d!.codisDuplicats!.length} dup.
                            </Badge>
                          )}
                          {agent.id === "bimSync" && log.opcio && (
                            <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-[10px]">{log.opcio}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-500 hidden md:table-cell">
                        {totalCanvis > 0
                          ? <span className="font-medium text-slate-700">{totalCanvis} canvis</span>
                          : <span className="text-slate-400">Sense canvis</span>}
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell">
                        {parts.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {parts.map((p, pi) => <span key={pi} className="text-slate-500 text-xs leading-snug">{p}</span>)}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Sense canvis</span>
                        )}
                        {(d?.codisDuplicats?.length ?? 0) > 0 && (
                          <span className="block mt-1 text-amber-600 text-[11px]">⚠ {d!.codisDuplicats!.join(", ")}</span>
                        )}
                      </td>
                    </tr>
                    {(d?.errors?.length ?? 0) > 0 && (
                      <tr className="border-b border-red-50 bg-red-50/40">
                        <td colSpan={4} className="px-5 py-2">
                          <p className="text-[10.5px] font-semibold text-red-500 uppercase tracking-widest mb-1">Detall d'errors</p>
                          <ul className="space-y-0.5">
                            {d!.errors!.map((e, ei) => (
                              <li key={ei} className="text-[11.5px] text-red-700 font-mono break-all leading-snug">❌ {e}</li>
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
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export function ControlAgentsPage() {
  const { getToken, loading: authLoading, user } = useAuth();

  const [selectedAgentId, setSelectedAgentId] = useState<string>("visor3d");
  const [logsPerAgent, setLogsPerAgent]     = useState<Record<string, SyncLog[]>>({});
  const [tokenPerAgent, setTokenPerAgent]   = useState<Record<string, ApsToken | null>>({});
  const [loading, setLoading]               = useState(true);

  // Triggering per agent: null | "copiar" | "pujar" | "sync"
  const [triggering, setTriggering]         = useState<string | null>(null);
  const [triggerMsg, setTriggerMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [polling, setPolling]               = useState(false);

  const loadingRef     = useRef(false);
  const needsReloadRef = useRef(false);
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const pollAgentIdRef = useRef<string>("");
  const logsRef        = useRef<Record<string, SyncLog[]>>({});
  const pollLastIdRef  = useRef<number>(0);

  const selectedAgent = AGENTS_CONFIG.find(a => a.id === selectedAgentId) ?? AGENTS_CONFIG[0];

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async (force = false) => {
    if (!force && loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    let tok = getToken();
    if (!tok) {
      const { data: { session } } = await supabase.auth.getSession();
      tok = session?.access_token ?? "";
    }
    if (!tok) {
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 500));
        const { data: { session } } = await supabase.auth.getSession();
        tok = session?.access_token ?? "";
        if (tok) break;
      }
    }
    if (!tok) { setLoading(false); loadingRef.current = false; return; }

    try {
      const agentsAmbLogs = AGENTS_CONFIG.filter(a => a.logTable);
      const results = await Promise.all(
        agentsAmbLogs.map(async (agent) => {
          const logsData = await supa(tok!, "GET",
            `${agent.logTable}?select=*&order=executat_a.desc&limit=10`
          ).catch(() => []);
          let tokenData: ApsToken | null = null;
          if (agent.tokenTable) {
            const td = await supa(tok!, "GET",
              `${agent.tokenTable}?select=updated_at,expires_at&id=eq.1`
            ).catch(() => []);
            tokenData = (td[0] as ApsToken) ?? null;
          }
          return { id: agent.id, logs: logsData as SyncLog[], token: tokenData };
        })
      );

      const newLogs:   Record<string, SyncLog[]>       = {};
      const newTokens: Record<string, ApsToken | null> = {};
      results.forEach(r => { newLogs[r.id] = r.logs; newTokens[r.id] = r.token; });
      logsRef.current = newLogs;
      setLogsPerAgent(newLogs);
      setTokenPerAgent(newTokens);
    } catch { /* silent */ } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [getToken]);

  const handleRefresh = useCallback(() => fetchAll(true), [fetchAll]);

  useEffect(() => { if (!authLoading && user) fetchAll(); }, [authLoading, user, fetchAll]);

  // ── Subscripcions Realtime ─────────────────────────────────────────────────

  useEffect(() => {
    const subs = AGENTS_CONFIG.filter(a => a.logTable).map(agent =>
      supabase.channel(`${agent.logTable}_ins`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: agent.logTable! },
          (payload) => {
            const nouLog = payload.new as SyncLog;
            if (pollRef.current && pollAgentIdRef.current === agent.id) {
              if (nouLog.id !== pollLastIdRef.current) {
                if (pollRef.current)        { clearInterval(pollRef.current);  pollRef.current = null; }
                if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
                setPolling(false);
                setTriggerMsg(
                  nouLog.errors
                    ? { ok: false, text: `Execució finalitzada amb ${nouLog.errors} error(s). Revisa l'historial.` }
                    : { ok: true,  text: "Execució finalitzada correctament." }
                );
              }
            }
            setLogsPerAgent(prev => {
              const prevLogs = prev[agent.id] ?? [];
              if (prevLogs.some(l => l.id === nouLog.id)) return prev;
              const updated = [nouLog, ...prevLogs].slice(0, 10);
              logsRef.current = { ...logsRef.current, [agent.id]: updated };
              return { ...prev, [agent.id]: updated };
            });
          })
        .subscribe()
    );
    return () => { subs.forEach(s => supabase.removeChannel(s)); };
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN")       setTimeout(() => fetchAll(), 50);
      if (event === "TOKEN_REFRESHED") { if (document.hidden) needsReloadRef.current = true; else fetchAll(); }
      if (event === "SIGNED_OUT")      { setLogsPerAgent({}); setTokenPerAgent({}); logsRef.current = {}; setLoading(false); loadingRef.current = false; }
    });
    const onVis = () => { if (!document.hidden && needsReloadRef.current && !pollRef.current) { needsReloadRef.current = false; fetchAll(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVis);
      if (pollRef.current)        clearInterval(pollRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [fetchAll]);

  // ── Execució genèrica ─────────────────────────────────────────────────────

  async function executaAgent(
    agent: AgentConfig,
    body: Record<string, any>,
    triggeringKey: string
  ) {
    const agentUrl    = (import.meta.env as any)[agent.agentUrlEnv] as string | undefined;
    const agentSecret = (import.meta.env as any)[agent.agentSecretEnv] as string | undefined;

    if (!agentUrl) {
      setTriggerMsg({ ok: false, text: `${agent.agentUrlEnv} no està configurada.` });
      return;
    }
    setTriggering(triggeringKey);
    setTriggerMsg(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (agentSecret) headers["Authorization"] = `Bearer ${agentSecret}`;
      const res = await fetch(`${agentUrl}${agent.syncEndpoint}`, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      if (res.ok) {
        setTriggerMsg({ ok: true, text: "Agent iniciat. Esperant el resultat en temps real…" });
        const lastKnownId = (logsRef.current[agent.id] ?? [])[0]?.id ?? 0;
        if (pollRef.current)        clearInterval(pollRef.current);
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
        pollAgentIdRef.current = agent.id;
        pollLastIdRef.current  = lastKnownId;
        setPolling(true);

        const stopPolling = () => {
          if (pollRef.current)        { clearInterval(pollRef.current);  pollRef.current = null; }
          if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
          setPolling(false);
        };
        pollRef.current = setInterval(async () => {
          await fetchAll(true);
          const newest = (logsRef.current[pollAgentIdRef.current] ?? [])[0];
          if (newest && newest.id !== pollLastIdRef.current) {
            stopPolling();
            setTriggerMsg(newest.errors
              ? { ok: false, text: `Execució finalitzada amb ${newest.errors} error(s). Revisa l'historial.` }
              : { ok: true,  text: "Execució finalitzada correctament." });
          }
        }, 8000);
        pollTimeoutRef.current = setTimeout(() => {
          stopPolling();
          setTriggerMsg({ ok: false, text: "Temps d'espera superat (>10 min). Comprova els logs manualment." });
        }, 10 * 60 * 1000);
      } else {
        const b = await res.json().catch(() => ({}));
        setTriggerMsg({ ok: false, text: b?.error ?? `Error ${res.status}` });
      }
    } catch {
      setTriggerMsg({ ok: false, text: "No s'ha pogut connectar amb l'agent." });
    } finally {
      setTriggering(null);
    }
  }

  // ── Handlers específics ───────────────────────────────────────────────────

  const handleVisor3DTrigger = () =>
    executaAgent(AGENTS_CONFIG[0], {}, "sync");

  const handleBimSyncTrigger = (opcio: "copiar-disciplines" | "pujar-masters") =>
    executaAgent(
      AGENTS_CONFIG[1],
      { opcio },
      opcio === "copiar-disciplines" ? "copiar" : "pujar"
    );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Control d'Agents</h1>
        <p className="text-sm text-slate-500 mt-1">Estat i gestió de la sincronització amb serveis externs</p>
      </div>

      <div className="flex gap-5 items-start">

        {/* Llista */}
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
                  onClick={() => { setSelectedAgentId(agent.id); if (!pollRef.current) setTriggerMsg(null); }}
                />
              ))}
            </div>
          </Card>
        </div>

        {/* Detall */}
        <div className="flex-1 min-w-0">
          {selectedAgent.id === "visor3d" && (
            <Visor3DPanel
              agent={selectedAgent}
              logs={logsPerAgent["visor3d"] ?? []}
              token={tokenPerAgent["visor3d"] ?? null}
              loading={loading}
              triggering={!!triggering}
              polling={polling}
              triggerMsg={triggerMsg}
              onTrigger={handleVisor3DTrigger}
              onRefresh={handleRefresh}
            />
          )}
          {selectedAgent.id === "bimSync" && (
            <BimSyncPanel
              agent={selectedAgent}
              logs={logsPerAgent["bimSync"] ?? []}
              loading={loading}
              triggering={triggering}
              polling={polling}
              triggerMsg={triggerMsg}
              onTrigger={handleBimSyncTrigger}
              onRefresh={handleRefresh}
            />
          )}
          {selectedAgent.id === "crearMasters" && (
            <CrearMastersPanel />
          )}
        </div>
      </div>
    </div>
  );
}
