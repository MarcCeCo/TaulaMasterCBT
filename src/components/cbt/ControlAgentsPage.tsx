// src/components/cbt/ControlAgentsPage.tsx
// Pàgina d'administració: Control d'Agents
//
// Agents:
//   1. visor3d   — Sincronitza models Revit d'ACC → Supabase (remot, Render)
//   2. bimLocal  — Grup d'eines locals BIM (execució a l'ordinador de l'usuari):
//                    · Crear Masters CBT   (script.py via pyRevit)
//                    · BIM Sync USB        (bim_sync_usb.py via VS Code)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { supabase } from "@/lib/supabase";
import { supaFetch as supa } from "@/lib/supaFetch";
import { useAuth } from "@/lib/auth";
import { useDataStore } from "@/lib/dataStore";
import { CATEGORY_CONFIG, VALID_CATEGORIES } from "./RevitBimPage";
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
  Upload,
  FolderSync,
  Terminal,
  Wrench,
  Package,
  Box,
  Loader2,
  Brain,
  DatabaseZap,
} from "lucide-react";

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface SyncLog {
  id: string;
  executat_a: string;
  sistemes_creats?: number;
  sistemes_actualitzats?: number;
  sistemes_eliminats?: number;
  installacions_creades?: number;
  installacions_actualitzades?: number;
  installacions_eliminades?: number;
  installacions_sense_canvis?: number;
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
  logTable: string | null;
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
    agentUrlEnv: "VITE_VISOR3D_URL",
    agentSecretEnv: "VITE_AGENT_SECRET",
  },
  {
    id: "bimLocal",
    nom: "Eines BIM Locals",
    descripcio: "Crear Masters (pyRevit) i BIM Sync USB — s'executen a l'ordinador de l'usuari",
    icon: <Wrench className="h-4 w-4" />,
    cronSchedule: "",
    logTable: "bim_sync_log",
    syncEndpoint: null,
    agentUrlEnv: "",
    agentSecretEnv: "",
  },
  {
    id: "crearFamilies",
    nom: "Crear Famílies",
    descripcio: "Genera famílies .rfa CBT per a Revit — s'executa a l'ordinador de l'usuari via pyRevit",
    icon: <Package className="h-4 w-4" />,
    cronSchedule: "",
    logTable: null,
    syncEndpoint: null,
    agentUrlEnv: "",
    agentSecretEnv: "",
  },
  {
    id: "lludrigaIA",
    nom: "LludrigaIA",
    descripcio: "Agent d'intel·ligència artificial RAG — indexa i gestiona el coneixement de la plataforma",
    icon: <Brain className="h-4 w-4" />,
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
  const isLocal     = agent.id === "bimLocal";
  const hasError    = lastLog ? (lastLog.errors ?? 0) > 0 : false;
  const statusColor = isLocal
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
          {isLocal
            ? "Script local · pyRevit + Python"
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

// ─── Pas numerado ─────────────────────────────────────────────────────────────

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

// ─── Botó de descàrrega ───────────────────────────────────────────────────────

function DownloadButton({
  label, href, filename, color = "violet",
}: {
  label: string; href: string; filename: string; color?: "violet" | "sky";
}) {
  const cls = color === "violet"
    ? "bg-violet-600 hover:bg-violet-700 text-white"
    : "bg-sky-600 hover:bg-sky-700 text-white";
  return (
    <Button
      className={`${cls} gap-2 rounded-xl h-9 px-5 text-sm shadow-sm`}
      onClick={() => {
        const a = document.createElement("a");
        a.href = href;
        a.download = filename;
        a.click();
      }}
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </Button>
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
  nomInstallacions: Record<string, string>;
}

function Visor3DPanel({
  agent, logs, token, loading, triggering, polling, triggerMsg, onTrigger, onRefresh, nomInstallacions,
}: Visor3DPanelProps) {
  const nextRun = nextCronDate(agent.cronSchedule);
  const lastLog = logs[0] ?? null;

  return (
    <div className="space-y-6">
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

        <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between gap-4 flex-wrap">
          <div>
            {token && (
              <>
                <p className="text-[10.5px] font-medium uppercase tracking-widest text-slate-400 mb-1">Token APS</p>
                <div className="flex items-center gap-2">
                  {token.expires_at > Date.now()
                    ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> Vàlid · expira {timeUntil(new Date(token.expires_at))}</Badge>
                    : <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] gap-1"><XCircle className="h-3 w-3" /> Expirat</Badge>}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
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
        </div>
        {triggerMsg && (
          <div className={`mt-2 px-4 py-2.5 rounded-xl text-sm flex items-start gap-2
            ${triggerMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {triggerMsg.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
            {triggerMsg.text}
          </div>
        )}
      </Card>

      <LogsTable agent={agent} logs={logs} loading={loading} nomInstallacions={nomInstallacions} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANELL EINES BIM LOCALS — Crear Masters + BIM Sync USB
// ═══════════════════════════════════════════════════════════════════════════════

const SCRIPT_PATH_PYREVIT =
  "%APPDATA%\\pyRevit-Master\\Extensions\\CBT.extension\\CBT.tab\\CBT Tools.panel\\Crear Masters.pushbutton\\script.py";

interface BimLocalPanelProps {
  logs:    SyncLog[];
  loading: boolean;
  onRefresh: () => void;
}

type SubtabId = "flux" | "crearMasters" | "bimSync";

function BimLocalPanel({ logs, loading, onRefresh }: BimLocalPanelProps) {
  const [subtab, setSubtab] = useState<SubtabId>("flux");
  const [copiedPath, setCopiedPath] = useState(false);

  const subtabs: { id: SubtabId; label: string; icon: React.ReactNode }[] = [
    { id: "flux",         label: "Flux complet",  icon: <ArrowRight className="h-3.5 w-3.5" /> },
    { id: "crearMasters", label: "Crear Masters",  icon: <FolderOpen className="h-3.5 w-3.5" /> },
    { id: "bimSync",      label: "BIM Sync USB",   icon: <HardDrive className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6">

      {/* Capçalera */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-violet-50 flex items-center justify-center text-violet-500">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 text-base">Eines BIM Locals</h2>
              <p className="text-xs text-slate-500 mt-0.5">Scripts que s'executen a l'ordinador de l'usuari</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}
            className="text-slate-400 hover:text-slate-600 shrink-0">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-2 flex-wrap">
          <Badge className="bg-violet-50 text-violet-700 border-violet-200 text-[10px]">Script local</Badge>
          <Badge className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">pyRevit + Revit 2024+</Badge>
          <Badge className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">Python 3 · VS Code</Badge>
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">No requereix servidor</Badge>
        </div>
      </Card>

      {/* Subtabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {subtabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSubtab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[12.5px] font-medium transition-all
              ${subtab === t.id
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"}`}
          >
            <span className={subtab === t.id ? "text-[#0099A8]" : "text-slate-400"}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Flux complet ───────────────────────────────────────────── */}
      {subtab === "flux" && (
        <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <Info className="h-4 w-4 text-[#0099A8]" />
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Flux complet BIM — pas a pas</p>
          </div>
          <div className="space-y-0">
            <Pas num={1} titol="Instal·la l'script Crear Masters a pyRevit" icon={<Download className="h-3.5 w-3.5" />}>
              <p>Descarrega <Code>script.py</Code> de la pestanya <strong>Crear Masters</strong> i copia'l a la ruta de pyRevit (botó <em>Copia la ruta</em>).</p>
              <p>A Revit, ves a <strong>CBT → CBT Tools → Crear Masters</strong>. Si no apareix, fes <em>pyRevit → Reload</em>.</p>
            </Pas>
            <Pas num={2} titol="Prepara la plantilla CBT_PLANTILLA.rte" icon={<FolderOpen className="h-3.5 w-3.5" />}>
              <p>Col·loca el fitxer <Code>CBT_PLANTILLA.rte</Code> a <Code>Documents\</Code> o al costat dels RVTs. L'script el troba automàticament.</p>
              <pre className="bg-slate-50 rounded-lg px-3 py-2 text-[10.5px] font-mono text-slate-600 overflow-x-auto mt-1">{`carpeta_arrel/
  001_GRANOLLERS/
    ED008_CALDES-DE-MONTBUI/
      001_MODEL-BIM/
        ED008_..._ENT.rvt
        ED008_..._EST.ZonaA.rvt
        ED008_..._MEP.rvt`}</pre>
            </Pas>
            <Pas num={3} titol="Executa Crear Masters des de Revit" icon={<Zap className="h-3.5 w-3.5" />}>
              <p>L'script detecta totes les instal·lacions, obre la plantilla en segon pla, vincula <Code>_ENT</Code>/<Code>_EST</Code>/<Code>_MEP</Code>, crea la vista 3D <Code>TAULA-MASTER</Code> i desa com a <Code>ED008_CALDES-DE-MONTBUI_MASTER.rvt</Code>.</p>
            </Pas>
            <Pas num={4} titol="Còpia disciplines al USB amb BIM Sync" icon={<HardDrive className="h-3.5 w-3.5" />}>
              <p>Descarrega <Code>bim_sync_usb.py</Code> de la pestanya <strong>BIM Sync USB</strong> i executa'l amb VS Code o <Code>python bim_sync_usb.py</Code>.</p>
              <p>Tria l'opció <strong>1 · Copiar disciplines → USB</strong> per copiar tots els <Code>_ENT/_EST/_MEP</Code> del Desktop Connector al USB.</p>
            </Pas>
            <Pas num={5} titol="Puja els MASTERs a ACC" icon={<Upload className="h-3.5 w-3.5" />}>
              <p>Al mateix script BIM Sync, tria l'opció <strong>2 · Pujar MASTERs → ACC</strong>. L'script puja els <Code>_MASTER.rvt</Code>, registra les xRefs i dispara el processament automàtic a ACC.</p>
              <p><strong>Important:</strong> les disciplines han d'estar a la mateixa carpeta <Code>001_MODEL-BIM</Code> d'ACC que el MASTER.</p>
            </Pas>
            <Pas num={6} titol="Verifica al Visor 3D" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
              <p>L'<strong>Agent Visor 3D</strong> sincronitza els URNs amb Supabase perquè apareguin al visor. Si el model no apareix, comprova l'estat de traducció a <strong>ACC → Documents</strong>.</p>
            </Pas>
          </div>
        </Card>
      )}

      {/* ── TAB: Crear Masters ──────────────────────────────────────────── */}
      {subtab === "crearMasters" && (
        <div className="space-y-6">
          {/* Descàrrega */}
          <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Script pyRevit</p>
            <p className="text-[12.5px] text-slate-500 mb-4 leading-relaxed">
              Obre la plantilla <Code>CBT_PLANTILLA.rte</Code>, vincula les disciplines per instal·lació
              i desa el fitxer <Code>_MASTER.rvt</Code>. S'executa dins de Revit via pyRevit.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <DownloadButton label="Descarregar script.py" href="/scripts/script.py" filename="script.py" color="violet" />
              <Button variant="outline"
                className="gap-2 rounded-xl h-9 px-4 text-sm border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => { navigator.clipboard.writeText(SCRIPT_PATH_PYREVIT); setCopiedPath(true); setTimeout(() => setCopiedPath(false), 2000); }}>
                {copiedPath
                  ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Copiat!</>
                  : <><Copy className="h-3.5 w-3.5" /> Copia la ruta de destí</>}
              </Button>
            </div>
            <p className="text-[11.5px] text-slate-400 mt-3 font-mono leading-relaxed break-all">
              {SCRIPT_PATH_PYREVIT}
            </p>
          </Card>

          {/* Instruccions */}
          <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-4 w-4 text-violet-500" />
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Com funciona</p>
            </div>
            <div className="space-y-0">
              <Pas num={1} titol="Instal·la l'script" icon={<Download className="h-3.5 w-3.5" />}>
                <p>Descarrega <Code>script.py</Code> i copia'l a la ruta indicada (botó <em>Copia la ruta de destí</em>). Si la carpeta no existeix, crea-la manualment.</p>
                <p>A Revit → <strong>pyRevit → Reload</strong> perquè aparegui a la barra <strong>CBT → CBT Tools → Crear Masters</strong>.</p>
              </Pas>
              <Pas num={2} titol="Prepara la plantilla i estructura de carpetes" icon={<FolderOpen className="h-3.5 w-3.5" />}>
                <p>Col·loca <Code>CBT_PLANTILLA.rte</Code> a <Code>Documents\</Code>. L'script cerca automàticament a les carpetes habituals (Desktop, Documents, OneDrive).</p>
                <p>Estructura de carpetes requerida:</p>
                <pre className="bg-slate-50 rounded-lg px-3 py-2 text-[10.5px] font-mono text-slate-600 overflow-x-auto mt-1">{`carpeta_arrel/
  XXX_SISTEMA/
    ED004_EDAR-MONTORNES-DEL-VALLES/
      001_MODEL-BIM/
        ED004_..._FM_ENT_24.rvt
        ED004_..._FM_EST_24.ZonaA.rvt   ← suporta zones
        ED004_..._FM_MEP_24.ZonaB.rvt   ← múltiples zones
    ED008_CALDES-DE-MONTBUI/
      001_MODEL-BIM/
        ED008_..._ENT.rvt`}</pre>
              </Pas>
              <Pas num={3} titol="Executa l'script" icon={<Zap className="h-3.5 w-3.5" />}>
                <p>Clic a <strong>Crear Masters</strong> a la barra pyRevit. Per a cada instal·lació:</p>
                <p>① Comprova l'accessibilitat de tots els RVTs <em>abans</em> d'obrir la plantilla (diagnòstic pre-vol).</p>
                <p>② Obre <Code>CBT_PLANTILLA.rte</Code> i neteja la geometria existent.</p>
                <p>③ Vincula tots els <Code>_ENT</Code>, <Code>_EST</Code> i <Code>_MEP</Code> (ZonaA, ZonaB inclosos).</p>
                <p>④ Crea la vista 3D <Code>TAULA-MASTER</Code> i la publica.</p>
                <p>⑤ Desa com a <Code>ED008_CALDES-DE-MONTBUI_MASTER.rvt</Code> amb ruta absoluta.</p>
              </Pas>
              <Pas num={4} titol="Resultat" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                <p>Si un MASTER ja existeix es <strong>sobreescriu</strong> (pots tornar a executar-lo de forma segura). Els fitxers amb tots els vincles carregats estan llestos per pujar a ACC.</p>
                <p>Quan pugis a ACC, puja el MASTER i tots els RVTs de disciplina a la <strong>mateixa carpeta</strong> del hub. ACC resoldrà els vincles pel nom del fitxer automàticament.</p>
              </Pas>
            </div>
          </Card>
        </div>
      )}

      {/* ── TAB: BIM Sync USB ───────────────────────────────────────────── */}
      {subtab === "bimSync" && (
        <div className="space-y-6">
          {/* Descàrrega */}
          <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Script Python</p>
            <p className="text-[12.5px] text-slate-500 mb-4 leading-relaxed">
              Copia les disciplines (<Code>_ENT/_EST/_MEP</Code>) del Desktop Connector al USB
              i puja els <Code>_MASTER</Code> a ACC via API amb registre automàtic de xRefs.
              S'executa amb VS Code o des del terminal.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <DownloadButton label="Descarregar bim_sync_usb.py" href="/scripts/bim_sync_usb.py" filename="bim_sync_usb.py" color="sky" />
            </div>
          </Card>

          {/* Configuració */}
          <Card className="p-4 border-amber-200 bg-amber-50 rounded-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-[12px] text-amber-800 space-y-1.5 leading-relaxed">
                <p className="font-semibold text-amber-900">Edita la configuració de l'script abans d'executar-lo</p>
                <p>Obre <Code>bim_sync_usb.py</Code> i modifica les constants al bloc <strong>CONFIGURACIÓ</strong> (línies 40–55):</p>
                <div className="font-mono bg-amber-100 rounded-lg px-3 py-2 text-[11px] text-amber-900 border border-amber-200 space-y-1">
                  <div><span className="text-amber-600">ORIGEN</span> = <span className="text-amber-800">Path(r"C:\Users\TU_USUARI\DC\ACCDocs\...")</span></div>
                  <div><span className="text-amber-600">USB</span> = <span className="text-amber-800">Path(r"F:")</span>  <span className="text-amber-500"># lletra del teu USB</span></div>
                  <div><span className="text-amber-600">APS_CLIENT_ID</span> = <span className="text-amber-800">"el_teu_client_id"</span></div>
                  <div><span className="text-amber-600">APS_CLIENT_SECRET</span> = <span className="text-amber-800">"el_teu_client_secret"</span></div>
                </div>
              </div>
            </div>
          </Card>

          {/* Instruccions */}
          <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-4 w-4 text-sky-500" />
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Com funciona</p>
            </div>
            <div className="space-y-0">
              <Pas num={1} titol="Instal·la les dependències" icon={<Terminal className="h-3.5 w-3.5" />}>
                <p>Executa una sola vegada a la terminal:</p>
                <pre className="bg-slate-50 rounded-lg px-3 py-2 text-[10.5px] font-mono text-slate-600 mt-1">pip install requests</pre>
                <p>Necessari per a les opcions de pujada a ACC (API REST).</p>
              </Pas>
              <Pas num={2} titol="Opció 1 · Copiar disciplines → USB" icon={<FolderSync className="h-3.5 w-3.5" />}>
                <p>Connecta el USB a l'ordinador amb el <strong>Desktop Connector</strong> actiu i els fitxers d'ACC sincronitzats localment.</p>
                <p>Executa l'script i tria l'opció <strong>1</strong>. L'script busca recursivament tots els <Code>_ENT</Code>, <Code>_EST</Code>, <Code>_MEP</Code> a la carpeta <Code>ORIGEN</Code> i els copia a <Code>F:\BIM_WORK\</Code> mantenint l'estructura. Els fitxers ja actualitzats es salten.</p>
              </Pas>
              <Pas num={3} titol="Opció 2 · Pujar MASTERs → ACC + xRefs" icon={<Upload className="h-3.5 w-3.5" />}>
                <p>Connecta el USB a qualsevol ordinador (no cal el Desktop Connector). Tria l'opció <strong>2</strong>.</p>
                <p>Per a cada <Code>_MASTER.rvt</Code> del USB, l'script:</p>
                <p>① Navega l'estructura de carpetes d'ACC per trobar la <Code>001_MODEL-BIM</Code> corresponent.</p>
                <p>② Puja el <Code>_MASTER.rvt</Code> a la carpeta correcta via API.</p>
                <p>③ Registra les <strong>xRefs</strong> (vincles disciplines) via <Code>POST /versions?copyFrom</Code>.</p>
                <p>④ ACC inicia el processament automàtic (traducció SVF2). <strong>No cal entrar manualment a cada fitxer.</strong></p>
              </Pas>
              <Pas num={4} titol="Comprova el resultat" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                <p>L'script desa un log a <Code>bim_sync_log.txt</Code> al costat de l'script amb el detall de cada execució. Al cap de pocs minuts, el MASTER federat hauria d'estar disponible a ACC per al visor 3D.</p>
              </Pas>
            </div>
          </Card>

          {/* Historial BIM Sync */}
          <LogsTable
            agent={AGENTS_CONFIG.find(a => a.id === "bimLocal")!}
            logs={logs}
            loading={loading}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAULA DE LOGS
// ═══════════════════════════════════════════════════════════════════════════════

function LogsTable({ agent, logs, loading, nomInstallacions }: {
  agent: AgentConfig;
  logs: SyncLog[];
  loading: boolean;
  nomInstallacions?: Record<string, string>;
}) {
  const [expandit, setExpandit] = useState<Set<string>>(new Set());

  const toggleExpandit = (id: string) =>
    setExpandit(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Resol l'etiqueta d'una entrada del log:
  // - Nous logs ja guarden "CODI – Nom"   → es mostra tal qual
  // - Logs antics guarden només "CODI"    → lookup al mapa
  const resolNom = (entrada: string): string => {
    if (entrada.includes(" – ")) return entrada;
    const nom = nomInstallacions?.[entrada];
    return nom ? `${entrada} – ${nom}` : entrada;
  };

  return (
    <Card className="border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          Historial ({logs.length})
        </p>
      </div>
      {loading && !logs.length ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">Carregant…</div>
      ) : !logs.length ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400">Cap execució registrada</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 640 }}>
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr className="text-left">
                <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-5" />
                <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data</th>
                <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estat</th>
                <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Resum</th>
                <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Canvis</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const isOk = (log.errors ?? 0) === 0;
                const d    = log.detalls;
                const expanded = expandit.has(log.id);

                // ── Resum textual ──────────────────────────────────────────
                const resumParts: string[] = [];
                let totalCanvis = 0;

                if (agent.id === "visor3d") {
                  totalCanvis =
                    (log.sistemes_creats    ?? 0) + (log.sistemes_eliminats     ?? 0) +
                    (log.installacions_creades ?? 0) + (log.installacions_actualitzades ?? 0) +
                    (log.installacions_eliminades ?? 0);
                  if (log.sistemes_creats)              resumParts.push(`${log.sistemes_creats} sist. nous`);
                  if (log.sistemes_eliminats)           resumParts.push(`${log.sistemes_eliminats} sist. eliminats`);
                  if (log.installacions_creades)        resumParts.push(`${log.installacions_creades} inst. noves`);
                  if (log.installacions_actualitzades)  resumParts.push(`${log.installacions_actualitzades} inst. actualitzades`);
                  if (log.installacions_eliminades)     resumParts.push(`${log.installacions_eliminades} inst. eliminades`);
                  if (log.installacions_sense_canvis)   resumParts.push(`${log.installacions_sense_canvis} sense canvis`);
                } else {
                  totalCanvis = (log.fitxers_pujats ?? 0) + (log.fitxers_copiats ?? 0);
                  if (log.opcio)             resumParts.push(`Opció: ${log.opcio}`);
                  if (log.fitxers_copiats)   resumParts.push(`${log.fitxers_copiats} fitxers copiats`);
                  if (log.fitxers_pujats)    resumParts.push(`${log.fitxers_pujats} pujats a ACC`);
                  if (log.xrefs_registrats)  resumParts.push(`${log.xrefs_registrats} xRefs`);
                }

                // ── Té detall expandible? ──────────────────────────────────
                const teDetall = agent.id === "visor3d" && (
                  (d?.installacionsActualitzades?.length ?? 0) > 0 ||
                  (d?.installacionsCreades?.length        ?? 0) > 0 ||
                  (d?.installacionsEliminades?.length     ?? 0) > 0 ||
                  (d?.errors?.length                      ?? 0) > 0
                );

                return (
                  <Fragment key={log.id}>
                    {/* ── Fila principal ──────────────────────────────────── */}
                    <tr
                      className={`border-t border-slate-100 transition-colors
                        ${teDetall ? "cursor-pointer hover:bg-slate-50/70" : "hover:bg-slate-50/40"}
                        ${i === 0 && !expanded ? "bg-slate-50/40" : ""}
                        ${expanded ? "bg-slate-50" : ""}`}
                      onClick={() => teDetall && toggleExpandit(log.id)}
                    >
                      {/* chevron */}
                      <td className="px-3 py-2 w-5">
                        {teDetall && (
                          <ChevronRight className={`h-3.5 w-3.5 text-slate-300 transition-transform ${expanded ? "rotate-90" : ""}`} />
                        )}
                      </td>

                      {/* data */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-medium text-[13px] text-slate-700">{formatDate(log.executat_a)}</span>
                        <span className="ml-2 text-xs text-slate-400">{timeAgo(log.executat_a)}</span>
                      </td>

                      {/* estat */}
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {isOk
                            ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> OK</Badge>
                            : <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] gap-1"><XCircle className="h-3 w-3" /> {log.errors} errors</Badge>}
                          {(d?.codisDuplicats?.length ?? 0) > 0 && (
                            <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] gap-1">
                              <AlertTriangle className="h-3 w-3" /> {d!.codisDuplicats!.length} dup.
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* resum */}
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {resumParts.length > 0
                          ? resumParts.join(" · ")
                          : <span className="text-slate-300">—</span>}
                      </td>

                      {/* total canvis */}
                      <td className="px-3 py-2 text-right">
                        {totalCanvis > 0
                          ? <span className="font-semibold text-[13px] text-slate-700">{totalCanvis}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                    </tr>

                    {/* ── Fila expandida: llista d'instal·lacions ──────────── */}
                    {expanded && teDetall && (
                      <tr className="border-t border-slate-100 bg-slate-50/80">
                        <td colSpan={5} className="px-0 py-0">
                          <div className="mx-3 my-2 rounded-xl border border-slate-200 overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-100 border-b border-slate-200 text-left">
                                  <th className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Instal·lació</th>
                                  <th className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Acció</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(d?.installacionsCreades ?? []).map((entrada, ci) => (
                                  <tr key={`c-${ci}`} className="border-t border-slate-100 hover:bg-emerald-50/40">
                                    <td className="px-3 py-1.5 text-slate-700 font-medium">{resolNom(entrada)}</td>
                                    <td className="px-3 py-1.5">
                                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Nova</Badge>
                                    </td>
                                  </tr>
                                ))}
                                {(d?.installacionsActualitzades ?? []).map((entrada, ci) => (
                                  <tr key={`a-${ci}`} className="border-t border-slate-100 hover:bg-blue-50/40">
                                    <td className="px-3 py-1.5 text-slate-700 font-medium">{resolNom(entrada)}</td>
                                    <td className="px-3 py-1.5">
                                      <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">Actualitzada</Badge>
                                    </td>
                                  </tr>
                                ))}
                                {(d?.installacionsEliminades ?? []).map((entrada, ci) => (
                                  <tr key={`e-${ci}`} className="border-t border-slate-100 hover:bg-red-50/40">
                                    <td className="px-3 py-1.5 text-slate-700 font-medium">{resolNom(entrada)}</td>
                                    <td className="px-3 py-1.5">
                                      <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px]">Eliminada</Badge>
                                    </td>
                                  </tr>
                                ))}
                                {(d?.errors ?? []).map((e, ei) => (
                                  <tr key={`err-${ei}`} className="border-t border-red-100 bg-red-50/30">
                                    <td colSpan={2} className="px-3 py-1.5 text-red-700 font-mono break-all">❌ {e}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
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
// PANELL CREAR FAMÍLIES
// ═══════════════════════════════════════════════════════════════════════════════

const SCRIPT_PATH_FULL =
  "%APPDATA%\\pyRevit-Master\\Extensions\\CBT.extension\\CBT.tab\\CBT Tools.panel\\Crear Families FULL.pushbutton\\script.py";
const SCRIPT_PATH_TEST =
  "%APPDATA%\\pyRevit-Master\\Extensions\\CBT.extension\\CBT.tab\\CBT Tools.panel\\Crear Families TEST.pushbutton\\script.py";

type FamiliesSubtabId = "flux" | "fullScript" | "testScript";

// ─── ZIP builder (sense dependències externes) ────────────────────────────────
function crc32(data: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function u16le(n: number): Uint8Array { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
function u32le(n: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }

async function buildZip(entries: { name: string; data: Uint8Array }[]): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32le(crc), ...u32le(size), ...u32le(size),
      ...u16le(nameBytes.length), 0, 0, ...nameBytes,
    ]);
    const cdEntry = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32le(crc), ...u32le(size), ...u32le(size),
      ...u16le(nameBytes.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ...u32le(offset), ...nameBytes,
    ]);
    centralDir.push(cdEntry);
    parts.push(localHeader, entry.data);
    offset += localHeader.length + size;
  }
  const cdOffset = offset;
  const cdSize = centralDir.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0,
    ...u16le(entries.length), ...u16le(entries.length),
    ...u32le(cdSize), ...u32le(cdOffset), 0, 0,
  ]);
  const allParts = [...parts, ...centralDir, eocd];
  const total = allParts.reduce((s, b) => s + b.length, 0);
  const buf = new Uint8Array(total);
  let pos = 0;
  for (const p of allParts) { buf.set(p, pos); pos += p.length; }
  return new Blob([buf], { type: "application/zip" });
}

const README_KIT = `CBT FamiliesKit — Instruccions
================================
CONTINGUT:
  · CBT_Revit_Config.json          — Configuració generada automàticament
  · CBT_PARAMETRES-COMPARTITS.txt  — Fitxer de paràmetres compartits Revit (CBT)
  · FULL_script.py                 — Script pyRevit per crear TOTES les famílies
  · TEST_script.py                 — Script pyRevit per crear 1 família per categoria (test)
  · README.txt                     — Aquest fitxer

COM INSTAL·LAR:
  1. Guarda CBT_Revit_Config.json a: C:\\Users\\<usuari>\\Documents\\CBT_Revit_Config.json
  2. Guarda CBT_PARAMETRES-COMPARTITS.txt a: C:\\Users\\<usuari>\\Documents\\
  3. Copia els scripts a les rutes de pyRevit:
     TEST: %APPDATA%\\pyRevit-Master\\Extensions\\CBT.extension\\CBT.tab\\CBT Tools.panel\\Crear Families TEST.pushbutton\\script.py
     FULL: %APPDATA%\\pyRevit-Master\\Extensions\\CBT.extension\\CBT.tab\\CBT Tools.panel\\Crear Families FULL.pushbutton\\script.py
  4. Reinicia Revit i executa el botó "Crear Families TEST" per validar.
  5. Si el TEST va bé, executa "Crear Families FULL".

Compatible amb Revit 2020-2030.`;

function CrearFamiliesPanel() {
  const { equipments } = useDataStore();
  const [subtab, setSubtab] = useState<FamiliesSubtabId>("flux");
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedTest, setCopiedTest] = useState(false);
  const [kitDownloaded, setKitDownloaded] = useState(false);
  const [kitBuilding, setKitBuilding] = useState(false);

  const subtabs: { id: FamiliesSubtabId; label: string; icon: React.ReactNode }[] = [
    { id: "flux",       label: "Flux complet",   icon: <ArrowRight className="h-3.5 w-3.5" /> },
    { id: "fullScript", label: "FULL Script",     icon: <Box className="h-3.5 w-3.5" /> },
    { id: "testScript", label: "TEST Script",     icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  ];

  // ── Genera i descarrega el ZIP CBT_FamiliesKit ────────────────────────────
  async function handleKitDownload() {
    setKitBuilding(true);
    try {
      const enc = new TextEncoder();

      // Construeix el JSON de configuració a partir dels equips actuals
      const equipByCode = new Map<string, string>();
      for (const eq of equipments) {
        if (eq.equipCode) equipByCode.set(eq.equipCode, eq.equipName);
        equipByCode.set(eq.id, eq.equipName);
      }

      const exportableItems = equipments
        .filter((eq) => {
          if (!eq.needsTable) return false;
          const cat = eq.revitCategory?.trim() ?? "";
          return !!cat && VALID_CATEGORIES.has(cat);
        })
        .map((eq) => {
          const cat = eq.revitCategory!.trim();
          const parentName = eq.parentEquipCode ? equipByCode.get(eq.parentEquipCode) ?? null : null;
          const nomComplet = parentName ? `${parentName} ${eq.equipName}` : eq.equipName;
          return {
            nom: nomComplet.toUpperCase().replace(/\s+/g, "-"),
            cat,
            template: CATEGORY_CONFIG[cat]?.template ?? "Metric Generic Model.rft",
            equip_code: eq.equipCode ?? "",
            table_code: eq.tableCode ?? "",
          };
        });

      const config = {
        generated_at: new Date().toISOString(),
        output_folder: "%USERPROFILE%\\Documents\\Families_Output",
        shared_params_path: "%USERPROFILE%\\Documents\\CBT_PARAMETRES-COMPARTITS.txt",
        total: exportableItems.length,
        equipments: exportableItems,
      };

      // Intenta descarregar els scripts estàtics del servidor
      const staticFiles = [
        { url: "/scripts/FULL_script.py",                   zipName: "FULL_script.py" },
        { url: "/scripts/TEST_script.py",                   zipName: "TEST_script.py" },
        { url: "/scripts/CBT_PARAMETRES-COMPARTITS.txt",    zipName: "CBT_PARAMETRES-COMPARTITS.txt" },
      ];
      const entries: { name: string; data: Uint8Array }[] = [
        { name: "CBT_Revit_Config.json", data: enc.encode(JSON.stringify(config, null, 2)) },
        { name: "README.txt",            data: enc.encode(README_KIT) },
      ];
      const results = await Promise.allSettled(
        staticFiles.map(({ url, zipName }) =>
          fetch(url).then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return { name: zipName, data: new Uint8Array(await r.arrayBuffer()) };
          })
        )
      );
      for (const res of results) {
        if (res.status === "fulfilled") entries.push(res.value);
        else console.warn("Fitxer no inclòs al ZIP:", res.reason);
      }

      const blob = await buildZip(entries);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `CBT_FamiliesKit_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setKitDownloaded(true);
      setTimeout(() => setKitDownloaded(false), 3000);
    } finally {
      setKitBuilding(false);
    }
  }

  return (
    <div className="space-y-6">

      {/* Capçalera */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 text-base">Crear Famílies</h2>
              <p className="text-xs text-slate-500 mt-0.5">Scripts pyRevit per generar famílies .rfa CBT automàticament</p>
            </div>
          </div>
          <Button
            className={`gap-2 rounded-xl h-9 px-5 text-sm shadow-sm text-white
              ${kitDownloaded ? "bg-emerald-600 hover:bg-emerald-700" : "bg-violet-600 hover:bg-violet-700"}`}
            onClick={handleKitDownload}
            disabled={kitBuilding}
          >
            {kitBuilding ? (
              <><div className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Generant…</>
            ) : kitDownloaded ? (
              <><CheckCircle2 className="h-3.5 w-3.5" /> Descarregat!</>
            ) : (
              <><Download className="h-3.5 w-3.5" /> Descarregar CBT_FamiliesKit</>
            )}
          </Button>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-2 flex-wrap">
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Script local</Badge>
          <Badge className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">pyRevit + Revit 2020–2030</Badge>
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">No requereix servidor</Badge>
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">JSON generat automàticament</Badge>
        </div>
      </Card>

      {/* Subtabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {subtabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSubtab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[12.5px] font-medium transition-all
              ${subtab === t.id
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"}`}
          >
            <span className={subtab === t.id ? "text-[#0099A8]" : "text-slate-400"}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Flux complet ─────────────────────────────────────────────── */}
      {subtab === "flux" && (
        <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <Info className="h-4 w-4 text-[#0099A8]" />
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Flux complet — pas a pas</p>
          </div>
          <div className="space-y-0">
            <Pas num={1} titol="Descarrega el CBT_FamiliesKit" icon={<Download className="h-3.5 w-3.5" />}>
              <p>Fes clic al botó <strong>Descarregar CBT_FamiliesKit</strong> d'aquest mateix panell. El ZIP es genera en el moment i conté <Code>FULL_script.py</Code>, <Code>TEST_script.py</Code>, <Code>CBT_Revit_Config.json</Code>, <Code>CBT_PARAMETRES-COMPARTITS.txt</Code> i <Code>README.txt</Code>.</p>
              <p>El JSON reflecteix l'estat <strong>actual</strong> de la Taula Master en el moment de la descàrrega.</p>
            </Pas>
            <Pas num={2} titol="Col·loca els fitxers de configuració" icon={<Terminal className="h-3.5 w-3.5" />}>
              <p>Desa <Code>CBT_Revit_Config.json</Code> a:</p>
              <pre className="bg-slate-50 rounded-lg px-3 py-2 text-[10.5px] font-mono text-slate-600 mt-1">C:\Users\&lt;usuari&gt;\Documents\CBT_Revit_Config.json</pre>
              <p>L'script el troba automàticament. Si no el trova, cerca també a <Code>Desktop</Code> i <Code>OneDrive\Documents</Code>.</p>
              <p className="mt-2">Desa també <Code>CBT_PARAMETRES-COMPARTITS.txt</Code> a la mateixa carpeta:</p>
              <pre className="bg-slate-50 rounded-lg px-3 py-2 text-[10.5px] font-mono text-slate-600 mt-1">C:\Users\&lt;usuari&gt;\Documents\CBT_PARAMETRES-COMPARTITS.txt</pre>
              <p>Aquest fitxer conté tots els paràmetres compartits CBT que s'afegiran a cada família generada.</p>
            </Pas>
            <Pas num={3} titol="Instal·la els scripts a pyRevit" icon={<FolderOpen className="h-3.5 w-3.5" />}>
              <p>Copia <Code>TEST_script.py</Code> i <Code>FULL_script.py</Code> a les respectives rutes de pyRevit (veure pestanyes <em>TEST Script</em> i <em>FULL Script</em> per les rutes exactes i el botó <em>Copia la ruta</em>).</p>
              <p>A Revit, fes <strong>pyRevit → Reload</strong> perquè apareguin els botons a <strong>CBT → CBT Tools → Crear Families</strong>.</p>
            </Pas>
            <Pas num={4} titol="Executa TEST per validar l'ecosistema" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
              <p>Clic a <strong>Crear Families TEST</strong> a la barra pyRevit. Crea <strong>1 família per categoria</strong> per verificar que tot funciona: plantilles RFT, paràmetres compartits i rutes de sortida.</p>
              <p>Si alguna categoria falla, revisa que la plantilla <Code>.rft</Code> corresponent existeixi a la instal·lació local de Revit.</p>
            </Pas>
            <Pas num={5} titol="Executa FULL per crear totes les famílies" icon={<Zap className="h-3.5 w-3.5" />}>
              <p>Si el TEST ha passat correctament, clic a <strong>Crear Families FULL</strong>. L'script processa tots els equips del JSON, obre la plantilla RFT per categoria, afegeix els paràmetres compartits CBT i desa cada <Code>CBT_NOM-EQUIP_CODI.rfa</Code> a <Code>Documents\Families_Output\</Code>.</p>
            </Pas>
            <Pas num={6} titol="Puja les famílies a ACC" icon={<Package className="h-3.5 w-3.5" />}>
              <p>Un cop generades, puja les <Code>.rfa</Code> de <Code>Documents\Families_Output\</Code> a la biblioteca compartida d'ACC. Les famílies quedaran disponibles per a tots els modeladors del projecte.</p>
            </Pas>
          </div>
        </Card>
      )}

      {/* ── TAB: FULL Script ─────────────────────────────────────────────── */}
      {subtab === "fullScript" && (
        <div className="space-y-6">
          <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Script FULL pyRevit</p>
            <p className="text-[12.5px] text-slate-500 mb-4 leading-relaxed">
              Processa <strong>tots els equips</strong> del JSON de configuració i genera una <Code>.rfa</Code> per equip,
              agrupats per categoria Revit. S'executa dins de Revit via pyRevit.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <DownloadButton label="Descarregar FULL_script.py" href="/scripts/FULL_script.py" filename="FULL_script.py" color="violet" />
              <Button
                variant="outline"
                className="gap-2 rounded-xl h-9 px-4 text-sm border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => { navigator.clipboard.writeText(SCRIPT_PATH_FULL); setCopiedFull(true); setTimeout(() => setCopiedFull(false), 2000); }}
              >
                {copiedFull
                  ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Copiat!</>
                  : <><Copy className="h-3.5 w-3.5" /> Copia la ruta de destí</>}
              </Button>
            </div>
            <p className="text-[11.5px] text-slate-400 mt-3 font-mono leading-relaxed break-all">
              {SCRIPT_PATH_FULL}
            </p>
          </Card>

          <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-4 w-4 text-violet-500" />
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Com funciona</p>
            </div>
            <div className="space-y-0">
              <Pas num={1} titol="Llegeix la configuració" icon={<FolderOpen className="h-3.5 w-3.5" />}>
                <p>L'script llegeix <Code>CBT_Revit_Config.json</Code> de <Code>Documents</Code>. Aquest fitxer conté la llista completa d'equips amb codi, categoria Revit i plantilla <Code>.rft</Code> associada.</p>
              </Pas>
              <Pas num={2} titol="Agrupa per categoria i plantilla" icon={<Box className="h-3.5 w-3.5" />}>
                <p>Per eficiència, agrupa els equips per plantilla RFT. Obre cada plantilla <strong>una sola vegada</strong> i genera totes les famílies d'aquella categoria en seqüència.</p>
              </Pas>
              <Pas num={3} titol="Afegeix paràmetres compartits CBT" icon={<Terminal className="h-3.5 w-3.5" />}>
                <p>Per cada família, afegeix els paràmetres compartits definits a <Code>CBT_PARAMETRES-COMPARTITS.txt</Code> (codi equip, taula, sistema, etc.) com a paràmetres d'instància o tipus.</p>
              </Pas>
              <Pas num={4} titol="Desa com a .rfa" icon={<Download className="h-3.5 w-3.5" />}>
                <p>Cada família es desa amb el nom <Code>CBT_NOM-EQUIP_CODI.rfa</Code> a la carpeta <Code>Documents\Families_Output\</Code>. Les famílies existents es sobreescriuen de forma segura.</p>
              </Pas>
            </div>
          </Card>
        </div>
      )}

      {/* ── TAB: TEST Script ─────────────────────────────────────────────── */}
      {subtab === "testScript" && (
        <div className="space-y-6">
          <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Script TEST pyRevit</p>
            <p className="text-[12.5px] text-slate-500 mb-4 leading-relaxed">
              Crea <strong>1 família per categoria</strong> per validar que l'ecosistema funciona correctament
              (plantilles RFT, paràmetres compartits, rutes de sortida). Executa sempre el TEST abans del FULL.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <DownloadButton label="Descarregar TEST_script.py" href="/scripts/TEST_script.py" filename="TEST_script.py" color="sky" />
              <Button
                variant="outline"
                className="gap-2 rounded-xl h-9 px-4 text-sm border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => { navigator.clipboard.writeText(SCRIPT_PATH_TEST); setCopiedTest(true); setTimeout(() => setCopiedTest(false), 2000); }}
              >
                {copiedTest
                  ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Copiat!</>
                  : <><Copy className="h-3.5 w-3.5" /> Copia la ruta de destí</>}
              </Button>
            </div>
            <p className="text-[11.5px] text-slate-400 mt-3 font-mono leading-relaxed break-all">
              {SCRIPT_PATH_TEST}
            </p>
          </Card>

          <Card className="p-4 border-blue-100 bg-blue-50 rounded-2xl">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-[12px] text-blue-800 space-y-1.5 leading-relaxed">
                <p className="font-semibold text-blue-900">Quan usar TEST vs FULL</p>
                <p><strong>TEST:</strong> Primera instal·lació, canvi de PC, actualització del JSON o quan s'afegeixen noves categories. Ràpid (1–2 min) i no sobreescriu producció.</p>
                <p><strong>FULL:</strong> Quan el TEST ha passat correctament i vols generar <em>totes</em> les famílies. Pot trigar 10–30 min depenent del nombre d'equips.</p>
              </div>
            </div>
          </Card>

          <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-4 w-4 text-sky-500" />
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Què valida el TEST</p>
            </div>
            <div className="space-y-0">
              <Pas num={1} titol="Accessibilitat de plantilles RFT" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                <p>Comprova que totes les plantilles <Code>.rft</Code> (Metric Mechanical Equipment, Metric Specialty Equipment, etc.) existeixen a la instal·lació local de Revit.</p>
              </Pas>
              <Pas num={2} titol="Fitxer de paràmetres compartits" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                <p>Verifica que <Code>CBT_PARAMETRES-COMPARTITS.txt</Code> és accessible i conté els paràmetres CBT necessaris.</p>
              </Pas>
              <Pas num={3} titol="Carpeta de sortida accessible" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                <p>Intenta crear la carpeta <Code>Documents\Families_Output\</Code> si no existeix i verifica que hi ha permisos d'escriptura.</p>
              </Pas>
              <Pas num={4} titol="Genera 1 família per categoria" icon={<Package className="h-3.5 w-3.5" />}>
                <p>Per cada categoria Revit present al JSON, crea la primera família de la llista. Si alguna falla, reporta l'error amb la causa exacta sense aturar la resta de categories.</p>
              </Pas>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANELL LLUDRIGA IA
// ═══════════════════════════════════════════════════════════════════════════════

function LludrigaIAPanel() {
  const [indexant, setIndexant]   = useState(false);
  const [progres,  setProgres]    = useState<string>("");
  const [resultat, setResultat]   = useState<{ ok: boolean; text: string } | null>(null);

  const reindexar = async () => {
    if (indexant) return;
    setIndexant(true);
    setResultat(null);
    setProgres("Iniciant indexació...");
    try {
      const res = await fetch("/api/index-embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipus: "tot" }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        let msg = text;
        try { msg = JSON.parse(text).error ?? text; } catch { /* raw text */ }
        setResultat({ ok: false, text: `Error: ${msg}` });
        return;
      }

      // Lector del stream NDJSON — cada línia és un objecte JSON de progrés
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let totalIndexats  = 0;
      let totalEliminats = 0;
      let totalOmesos    = 0;
      let totalErrors    = 0;
      let tempMs = 0;

      const fasesLabel: Record<string, string> = {
        equip: "Equips", field: "Camps", gubim: "GuBIMClass",
        projecte: "Projectes", tag: "TAGs projecte", rosmiman: "TAGs Rosmiman",
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as {
              fase?: string; estat?: string; total?: number; nous?: number;
              indexats?: number; eliminats?: number; omesos?: number;
              errors?: number; temps_ms?: number;
              fet?: boolean; error?: string; detall?: string;
            };

            if (msg.error) {
              setResultat({ ok: false, text: `Error: ${msg.error}${msg.detall ? ` — ${msg.detall}` : ""}` });
              return;
            }
            if (msg.fet) {
              totalIndexats  = msg.indexats  ?? totalIndexats;
              totalEliminats = msg.eliminats ?? totalEliminats;
              totalOmesos    = msg.omesos    ?? totalOmesos;
              totalErrors    = msg.errors    ?? totalErrors;
              tempMs         = msg.temps_ms  ?? tempMs;
              setProgres("");
            } else if (msg.fase && msg.estat) {
              const label = fasesLabel[msg.fase] ?? msg.fase;
              if (msg.estat === "carregant") setProgres(`Carregant ${label}...`);
              if (msg.estat === "indexant")  setProgres(`Indexant ${label} (${msg.nous ?? "?"} nous de ${msg.total ?? "?"})...`);
              if (msg.estat === "fet") {
                const parts = [];
                if (msg.indexats)  parts.push(`${msg.indexats} indexats`);
                if (msg.eliminats) parts.push(`${msg.eliminats} eliminats`);
                if (msg.omesos)    parts.push(`${msg.omesos} sense canvis`);
                setProgres(`✓ ${label}: ${parts.join(", ")}`);
                totalIndexats  += msg.indexats  ?? 0;
                totalEliminats += msg.eliminats ?? 0;
                totalOmesos    += msg.omesos    ?? 0;
                totalErrors    += msg.errors    ?? 0;
              }
            }
          } catch { /* línia malformada, ignorar */ }
        }
      }

      const partsResum = [`${totalIndexats} indexats`];
      if (totalEliminats) partsResum.push(`${totalEliminats} eliminats`);
      if (totalOmesos)    partsResum.push(`${totalOmesos} sense canvis`);
      setResultat({
        ok: totalErrors === 0,
        text: `${partsResum.join(" · ")} en ${(tempMs / 1000).toFixed(1)}s${totalErrors ? ` (${totalErrors} errors)` : ""}`,
      });
    } catch (err) {
      setResultat({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setIndexant(false);
      setProgres("");
    }
  };

  return (
    <div className="space-y-6">

      {/* Capçalera */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-[#0099A8]/10 flex items-center justify-center text-[#0099A8]">
            <Brain className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-800 text-base">LludrigaIA</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Agent d'intel·ligència artificial RAG basat en Voyage AI + pgvector
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-2 flex-wrap">
          <Badge className="bg-[#0099A8]/8 text-[#0099A8] border-[#0099A8]/20 text-[10px]">Voyage AI</Badge>
          <Badge className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">pgvector · Supabase</Badge>
          <Badge className="bg-slate-50 text-slate-600 border-slate-200 text-[10px]">RAG ~750 tokens/consulta</Badge>
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Requereix VOYAGE_API_KEY</Badge>
        </div>
      </Card>

      {/* Secció indexació */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-center gap-2 mb-1">
          <DatabaseZap className="h-4 w-4 text-[#0099A8]" />
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">
            Indexació de coneixement
          </p>
        </div>
        <p className="text-[12.5px] text-slate-500 mb-5 leading-relaxed">
          Genera els embeddings vectorials de tots els equips, camps, GuBIMClass, projectes i TAGs
          de la plataforma. Necessari per al funcionament del xat assistit per RAG.
          Triga aproximadament <strong>1–2 minuts</strong>.
        </p>

        <div className="flex items-center gap-4 flex-wrap">
          <Button
            onClick={reindexar}
            disabled={indexant}
            className="bg-[#0099A8] hover:bg-[#007a88] text-white gap-2 rounded-xl h-10 px-6 text-sm shadow-sm"
          >
            {indexant ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Indexant…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Reindexar ara
              </>
            )}
          </Button>
          {indexant && (
            <div className="flex items-center gap-2 text-[#0099A8] text-xs">
              <div className="h-3.5 w-3.5 rounded-full border-2 border-[#0099A8] border-t-transparent animate-spin" />
              {progres || "Indexant tota la plataforma…"}
            </div>
          )}
        </div>

        {resultat && (
          <div
            className={`mt-4 px-4 py-3 rounded-xl text-sm flex items-start gap-2
              ${resultat.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
          >
            {resultat.ok
              ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
            {resultat.ok ? `✅ ${resultat.text}` : `❌ ${resultat.text}`}
          </div>
        )}
      </Card>

      {/* Informació tècnica */}
      <Card className="p-5 border-slate-100 shadow-sm bg-white rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-[#0099A8]" />
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400">Com funciona el RAG</p>
        </div>
        <div className="space-y-0">
          <Pas num={1} titol="Indexació (aquest botó)" icon={<DatabaseZap className="h-3.5 w-3.5" />}>
            <p>Llegeix tots els equips, camps, GuBIMClass, projectes i TAGs de Supabase, genera un vector de 1.024 dimensions per a cada registre via <strong>Voyage AI</strong> i els desa a la taula <Code>cbt_embeddings</Code>.</p>
          </Pas>
          <Pas num={2} titol="Consulta al xat" icon={<Brain className="h-3.5 w-3.5" />}>
            <p>Quan l'usuari fa una pregunta, el backend vectoritza la pregunta, executa la funció <Code>cerca_rag()</Code> de pgvector i recupera els <strong>8 fragments més rellevants</strong> (~750 tokens).</p>
          </Pas>
          <Pas num={3} titol="Resposta contextualitzada" icon={<Zap className="h-3.5 w-3.5" />}>
            <p>Els fragments es passen com a context al model de llenguatge (Groq), que genera una resposta precisa sense necessitat d'enviar tota la base de dades a cada consulta.</p>
          </Pas>
          <Pas num={4} titol="Quan reindexar" icon={<RefreshCw className="h-3.5 w-3.5" />}>
            <p>Reindexar quan s'afegeixen nous equips o projectes, es modifiquen codis o noms clau, o quan el xat dona respostes incorrectes o no troba informació que hauria de conèixer.</p>
          </Pas>
        </div>
      </Card>

      {/* Variables d'entorn requerides */}
      <Card className="p-4 border-amber-200 bg-amber-50 rounded-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-[12px] text-amber-800 space-y-1.5 leading-relaxed">
            <p className="font-semibold text-amber-900">Variables d'entorn necessàries a Vercel</p>
            <div className="font-mono bg-amber-100 rounded-lg px-3 py-2 text-[11px] text-amber-900 border border-amber-200 space-y-1">
              <div><span className="text-amber-600">VOYAGE_API_KEY</span>        = <span className="text-amber-800">va-xxxxxxxxxx</span></div>
              <div><span className="text-amber-600">SUPABASE_URL</span>           = <span className="text-amber-800">https://xxxx.supabase.co</span></div>
              <div><span className="text-amber-600">SUPABASE_SERVICE_ROLE_KEY</span> = <span className="text-amber-800">eyJxxxx  ← service_role, no l'anon!</span></div>
            </div>
            <p>Obtén la clau de Voyage AI a <strong>voyageai.com → Dashboard → API Keys</strong> (50M tokens gratuïts/mes).</p>
          </div>
        </div>
      </Card>

    </div>
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
  const [nomInstallacions, setNomInstallacions] = useState<Record<string, string>>({});
  const [loading, setLoading]               = useState(true);

  const [triggering, setTriggering]         = useState<string | null>(null);
  const [triggerMsg, setTriggerMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [polling, setPolling]               = useState(false);

  const loadingRef     = useRef(false);
  const needsReloadRef = useRef(false);
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const pollAgentIdRef = useRef<string>("");
  const logsRef        = useRef<Record<string, SyncLog[]>>({});
  const pollLastIdRef  = useRef<string>("");

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

      // Mapa codi → nom per enriquir logs antics que només guardaven el codi
      const instData = await supa(tok!, "GET",
        "visor3d_installacions?select=codi_installacio,nom"
      ).catch(() => []);
      const nomMap: Record<string, string> = {};
      for (const row of instData as { codi_installacio: string; nom: string }[]) {
        nomMap[row.codi_installacio] = row.nom;
      }
      setNomInstallacions(nomMap);
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
            // Actualitza l'estat local immediatament amb el nou log
            setLogsPerAgent(prev => {
              const prevLogs = prev[agent.id] ?? [];
              if (prevLogs.some(l => l.id === nouLog.id)) return prev;
              const updated = [nouLog, ...prevLogs].slice(0, 10);
              logsRef.current = { ...logsRef.current, [agent.id]: updated };
              return { ...prev, [agent.id]: updated };
            });

            // Si estàvem esperant el resultat d'una execució manual, atura el polling
            // (eliminem el guard pollRef.current per capturar l'event fins i tot si el Realtime
            // arriba abans que el setInterval dispari la primera iteració)
            if (pollAgentIdRef.current === agent.id && nouLog.id !== pollLastIdRef.current) {
              if (pollRef.current)        { clearInterval(pollRef.current);  pollRef.current = null; }
              if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
              setPolling(false);
              setTriggerMsg(
                nouLog.errors
                  ? { ok: false, text: `Execució finalitzada amb ${nouLog.errors} error(s). Revisa l'historial.` }
                  : { ok: true,  text: "Execució finalitzada correctament." }
              );
            }
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

  // ── Execució agent Visor 3D ───────────────────────────────────────────────

  async function executaAgentVisor3D() {
    const agent     = AGENTS_CONFIG[0];
    const agentUrl  = (import.meta.env as any)[agent.agentUrlEnv] as string | undefined;
    const agentSecret = (import.meta.env as any)[agent.agentSecretEnv] as string | undefined;

    if (!agentUrl) {
      setTriggerMsg({ ok: false, text: `${agent.agentUrlEnv} no està configurada.` });
      return;
    }
    setTriggering("sync");
    setTriggerMsg(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (agentSecret) headers["Authorization"] = `Bearer ${agentSecret}`;
      const res = await fetch(`${agentUrl}${agent.syncEndpoint}`, {
        method: "POST", headers, body: JSON.stringify({}),
      });
      if (res.ok) {
        setTriggerMsg({ ok: true, text: "Agent iniciat. Esperant el resultat en temps real…" });
        const lastKnownId = (logsRef.current[agent.id] ?? [])[0]?.id ?? "";
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

        let isFetchingPoll = false;
        const checkForNewLog = async () => {
          if (isFetchingPoll) return;
          isFetchingPoll = true;
          try {
            await fetchAll(true);
            const newest = (logsRef.current[pollAgentIdRef.current] ?? [])[0];
            if (newest && newest.id !== pollLastIdRef.current) {
              stopPolling();
              setTriggerMsg(newest.errors
                ? { ok: false, text: `Execució finalitzada amb ${newest.errors} error(s). Revisa l'historial.` }
                : { ok: true,  text: "Execució finalitzada correctament." });
            }
          } finally {
            isFetchingPoll = false;
          }
        };

        // Primera comprovació immediata (per agents que acaben ràpid, < 5s)
        setTimeout(checkForNewLog, 2000);
        // Polling cada 5s
        pollRef.current = setInterval(checkForNewLog, 5000);
        pollTimeoutRef.current = setTimeout(async () => {
          stopPolling();
          await fetchAll(true);
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
              onTrigger={executaAgentVisor3D}
              onRefresh={handleRefresh}
              nomInstallacions={nomInstallacions}
            />
          )}
          {selectedAgent.id === "bimLocal" && (
            <BimLocalPanel
              logs={logsPerAgent["bimLocal"] ?? []}
              loading={loading}
              onRefresh={handleRefresh}
            />
          )}
          {selectedAgent.id === "crearFamilies" && (
            <CrearFamiliesPanel />
          )}
          {selectedAgent.id === "lludrigaIA" && (
            <LludrigaIAPanel />
          )}
        </div>
      </div>
    </div>
  );
}
