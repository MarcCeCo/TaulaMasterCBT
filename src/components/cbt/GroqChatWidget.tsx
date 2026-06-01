// src/components/cbt/GroqChatWidget.tsx
// Xat de suport flotant alimentat per Groq.
// Apareix a totes les pàgines via TaulaMasterMain.
// La crida a l'API passa per /api/groq-chat (Vercel Edge Function)
// perquè la clau GROQ_API_KEY mai surti al client.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Loader2, Send, Sparkles, X } from "lucide-react";

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface Missatge {
  rol: "user" | "assistant";
  text: string;
  ts: number;
}

// ─── System prompt ────────────────────────────────────────────────────────────
// Aquest prompt es passa a l'Edge Function i mai arriba al client.
// L'exportem com a constant perquè l'Edge Function el pugui importar directament
// si en algun moment s'estructura el projecte com a monorepo. Per ara l'Edge
// Function té la seva pròpia còpia (veure /api/groq-chat.ts).

export const SYSTEM_PROMPT = `Ets l'assistent de suport de TaulaMaster CBT, la plataforma de gestió d'instal·lacions del Consorci Besòs Tordera.

Respon sempre en català, de forma clara i concisa. Si et pregunten en castellà o anglès, respon en aquell idioma.

## La plataforma

TaulaMaster CBT és una aplicació web (React + Vite + Supabase + Vercel) que centralitza la gestió d'equips i instal·lacions de sistemes de sanejament. Permet:
- Gestionar equips i instal·lacions (taula master)
- Visualitzar models BIM en 3D directament al navegador (Autodesk Viewer SDK)
- Sincronitzar models Revit d'Autodesk Fusion Teams (ACC) automàticament
- Exportar dades a Rosmiman (GMAO)
- Gestionar usuaris i permisos per rol

## Agents

**Agent Visor 3D** (`visor3d`, port 3002 a Render):
- Sincronitza models Revit d'ACC → Supabase (taules visor3d_sistemes i visor3d_installacions)
- S'executa automàticament el dia 1 de cada mes a les 06:00 UTC
- També es pot disparar manualment des de Control d'Agents → "Executar ara"
- Requereix token APS 3-legged vàlid (gestionat pel token-service)
- Endpoint: POST /sync (requereix Bearer AGENT_SECRET)

**Token Service** (`token-service`, port 3001 a Render):
- Gestiona el token OAuth 3-legged d'Autodesk Platform Services (APS)
- Renova el token proactivament cada 50 minuts
- Flux d'autenticació: GET /auth/login → Autodesk → GET /auth/callback
- El token es desa a Supabase (taula aps_tokens, id=1)

**Eines BIM Locals** (no és un servei remot):
- **Crear Masters** (pyRevit): script Python que s'executa dins de Revit. Obre CBT_PLANTILLA.rte, vincula disciplines (_ENT/_EST/_MEP) i desa el fitxer _MASTER.rvt
- **BIM Sync USB** (Python): copia disciplines al USB i puja MASTERs a ACC via API

## Estructura de carpetes a ACC (Autodesk Forma/Fusion Teams)

\`\`\`
besso-digital/
  XXX_NOM-SISTEMA/          ← prefix numèric ≥ 001 (ex: 001_GRANOLLERS)
    CODI_NOM-INSTALLACIO/   ← ex: ED008_CALDES-DE-MONTBUI
      001_MODEL-BIM/        ← carpeta fixa obligatòria
        CODI_..._ENT.rvt    ← arquitectura/entorn
        CODI_..._EST.rvt    ← estructura
        CODI_..._MEP.rvt    ← instal·lacions
        CODI_..._MASTER.rvt ← federat (conté tots els vincles)
\`\`\`

## Taules Supabase principals

- **visor3d_sistemes**: id, nom, ordre → sistemes d'instal·lacions
- **visor3d_installacions**: codi_installacio, nom, sistema_id, urn, urn_master, urn_mep, urn_ent, urn_est, embed_url, last_modified_time
- **visor3d_sync_log**: historial d'execucions de l'Agent Visor 3D
- **aps_tokens**: id=1, access_token, refresh_token, expires_at
- **bim_sync_log**: historial d'execucions del BIM Sync USB

## Variables d'entorn clau

Frontend (Vercel):
- VITE_VISOR3D_URL: URL del servei visor3d a Render
- VITE_TOKEN_SERVICE_URL: URL del token-service a Render
- VITE_AGENT_SECRET: secret compartit per autoritzar crides als agents

Backend (Render, per cada agent):
- SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
- APS_CLIENT_ID / APS_CLIENT_SECRET
- APS_HUB_ID / APS_PROJECT_ID
- AGENT_SECRET
- APS_CALLBACK_URL (token-service)

## Problemes freqüents i solucions

**Token APS "Expirat" a Control d'Agents:**
1. Obre https://[token-service-url]/auth/login
2. Autoritza amb el compte Autodesk
3. El token es desa automàticament a Supabase
4. L'Agent Visor 3D ja podrà sincronitzar

**El model no apareix al Visor 3D:**
1. Comprova que el fitxer .rvt existeix a la carpeta 001_MODEL-BIM d'ACC
2. Verifica l'estat de traducció a ACC → Documents (ha d'estar "Ready")
3. Executa l'Agent Visor 3D manualment des de Control d'Agents
4. Si el codi d'instal·lació no segueix el format LLETRESNÚMEROS (ex: ED008), no es detecta

**L'agent no s'ha executat automàticament:**
- El servidor es refresca a Render (reinici): el scheduler es reinicia i recalcula la propera execució
- Comprova els logs a Control d'Agents per veure l'historial

**Error al BIM Sync USB "No s'ha trobat la carpeta":**
- La carpeta d'instal·lació ha de tenir el format CODI_NOM-AMB-GUIONS (ex: ED008_CALDES-DE-MONTBUI)
- La subcarpeta 001_MODEL-BIM ha d'existir i contenir almenys un .rvt

Respon de forma útil i directa. Si no saps la resposta, indica-ho clarament.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHora(ts: number): string {
  return new Date(ts).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" });
}

// ─── Component principal ──────────────────────────────────────────────────────

export function GroqChatWidget() {
  const [obert, setObert]           = useState(false);
  const [missatges, setMissatges]   = useState<Missatge[]>([]);
  const [input, setInput]           = useState("");
  const [carregant, setCarregant]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [nouMissatge, setNouMissatge] = useState(false);

  const endRef    = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const panellRef = useRef<HTMLDivElement>(null);

  // Scroll automàtic al final
  useEffect(() => {
    if (obert) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [missatges, obert]);

  // Focus a l'input quan s'obre
  useEffect(() => {
    if (obert) setTimeout(() => inputRef.current?.focus(), 150);
  }, [obert]);

  // Indicador de nou missatge quan el panell és tancat
  useEffect(() => {
    if (!obert && missatges.length > 0 && missatges.at(-1)?.rol === "assistant") {
      setNouMissatge(true);
    }
  }, [missatges, obert]);

  const obrePanell = () => {
    setObert(true);
    setNouMissatge(false);
  };

  const tancaPanell = () => setObert(false);

  // ── Enviar missatge ────────────────────────────────────────────────────────

  const envia = async () => {
    const text = input.trim();
    if (!text || carregant) return;

    const nouUserMsg: Missatge = { rol: "user", text, ts: Date.now() };
    const historial = [...missatges, nouUserMsg];

    setMissatges(historial);
    setInput("");
    setCarregant(true);
    setError(null);

    try {
      const res = await fetch("/api/groq-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historial.map(m => ({ role: m.rol, content: m.text })),
        }),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error ?? `Error ${res.status}`);
      }

      const data = await res.json() as { reply: string };
      setMissatges(prev => [
        ...prev,
        { rol: "assistant", text: data.reply, ts: Date.now() },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setCarregant(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      envia();
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Panell de xat ───────────────────────────────────────────────── */}
      <div
        ref={panellRef}
        className="fixed bottom-[84px] right-5 z-50 flex flex-col"
        style={{
          width: 360,
          height: 520,
          background: "white",
          borderRadius: 20,
          boxShadow: "0 8px 40px rgba(0,90,99,0.18), 0 2px 8px rgba(0,0,0,0.08)",
          border: "1px solid rgba(0,153,168,0.15)",
          transition: "opacity 180ms ease, transform 180ms ease",
          opacity: obert ? 1 : 0,
          transform: obert ? "translateY(0) scale(1)" : "translateY(12px) scale(0.97)",
          pointerEvents: obert ? "auto" : "none",
        }}
      >
        {/* Capçalera */}
        <div
          className="flex items-center gap-3 px-4 py-3 shrink-0"
          style={{
            borderBottom: "1px solid rgba(0,153,168,0.10)",
            background: "linear-gradient(135deg, #0099A8 0%, #007380 100%)",
            borderRadius: "20px 20px 0 0",
          }}
        >
          <div className="h-8 w-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight">Assistent CBT</p>
            <p className="text-white/70 text-[10.5px]">Preguntes sobre la plataforma</p>
          </div>
          <button
            onClick={tancaPanell}
            className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ChevronDown className="h-4 w-4 text-white" />
          </button>
        </div>

        {/* Zona de missatges */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,153,168,0.2) transparent" }}
        >
          {/* Missatge de benvinguda */}
          {missatges.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <div className="h-12 w-12 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #EAF8FA, #C8EFF4)" }}>
                <Bot className="h-6 w-6" style={{ color: "#0099A8" }} />
              </div>
              <p className="text-sm font-semibold text-slate-700">Com puc ajudar-te?</p>
              <p className="text-[11.5px] text-slate-400 leading-relaxed">
                Pregunta'm sobre els agents, el flux BIM, la configuració o qualsevol dubte de la plataforma.
              </p>
              {/* Suggeriments ràpids */}
              <div className="flex flex-col gap-1.5 w-full mt-1">
                {[
                  "Com renovo el token APS?",
                  "Per què no apareix el model al visor?",
                  "Com funciona el flux BIM complet?",
                ].map(s => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                    className="text-left text-[11.5px] px-3 py-2 rounded-xl transition-colors"
                    style={{
                      background: "rgba(0,153,168,0.06)",
                      border: "1px solid rgba(0,153,168,0.12)",
                      color: "#007380",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Missatges */}
          {missatges.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.rol === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {m.rol === "assistant" && (
                <div className="h-6 w-6 rounded-lg shrink-0 flex items-center justify-center mt-0.5"
                  style={{ background: "linear-gradient(135deg, #0099A8, #007380)" }}>
                  <Sparkles className="h-3 w-3 text-white" />
                </div>
              )}
              <div
                className="max-w-[78%] px-3 py-2 rounded-2xl text-[12.5px] leading-relaxed"
                style={
                  m.rol === "user"
                    ? { background: "linear-gradient(135deg, #0099A8, #007380)", color: "white", borderBottomRightRadius: 6 }
                    : { background: "#F3F4F2", color: "#1e293b", borderBottomLeftRadius: 6 }
                }
              >
                {/* Renderitza salts de línia i text en negreta bàsic */}
                {m.text.split("\n").map((linia, li) => (
                  <span key={li}>
                    {linia}
                    {li < m.text.split("\n").length - 1 && <br />}
                  </span>
                ))}
                <div className={`text-[9.5px] mt-1 ${m.rol === "user" ? "text-white/60 text-right" : "text-slate-400"}`}>
                  {formatHora(m.ts)}
                </div>
              </div>
            </div>
          ))}

          {/* Indicador "escrivint" */}
          {carregant && (
            <div className="flex gap-2 items-center">
              <div className="h-6 w-6 rounded-lg shrink-0 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #0099A8, #007380)" }}>
                <Sparkles className="h-3 w-3 text-white" />
              </div>
              <div className="px-3 py-2.5 rounded-2xl rounded-bl-md flex gap-1 items-center"
                style={{ background: "#F3F4F2" }}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: "#0099A8",
                      animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-xl text-[11.5px]"
              style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
              ❌ {error}
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 shrink-0"
          style={{ borderTop: "1px solid rgba(0,153,168,0.08)" }}>
          <div
            className="flex items-end gap-2 rounded-2xl px-3 py-2"
            style={{
              background: "#F3F4F2",
              border: "1.5px solid",
              borderColor: input ? "rgba(0,153,168,0.35)" : "rgba(0,153,168,0.12)",
              transition: "border-color 150ms",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escriu la teva pregunta…"
              rows={1}
              disabled={carregant}
              className="flex-1 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 resize-none outline-none leading-relaxed"
              style={{ maxHeight: 80, minHeight: 20 }}
            />
            <button
              onClick={envia}
              disabled={!input.trim() || carregant}
              className="h-7 w-7 rounded-xl flex items-center justify-center shrink-0 transition-all"
              style={{
                background: input.trim() && !carregant
                  ? "linear-gradient(135deg, #0099A8, #007380)"
                  : "rgba(0,153,168,0.12)",
                color: input.trim() && !carregant ? "white" : "rgba(0,153,168,0.4)",
              }}
            >
              {carregant
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-[9.5px] text-slate-300 text-center mt-1.5">
            Enter per enviar · Shift+Enter per nova línia
          </p>
        </div>
      </div>

      {/* ── Botó flotant ────────────────────────────────────────────────── */}
      <button
        onClick={obert ? tancaPanell : obrePanell}
        className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg transition-all"
        style={{
          background: obert
            ? "linear-gradient(135deg, #005A63, #003D44)"
            : "linear-gradient(135deg, #0099A8, #007380)",
          boxShadow: obert
            ? "0 4px 20px rgba(0,90,99,0.35)"
            : "0 4px 20px rgba(0,153,168,0.45), 0 2px 6px rgba(0,0,0,0.1)",
          transform: obert ? "rotate(0deg)" : "rotate(0deg)",
          transition: "all 200ms ease",
        }}
        title={obert ? "Tancar assistent" : "Obrir assistent CBT"}
      >
        {obert
          ? <X className="h-5 w-5 text-white" />
          : <Bot className="h-5 w-5 text-white" />}

        {/* Badge de nou missatge */}
        {nouMissatge && !obert && (
          <span
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ background: "#EF4444" }}
          >
            !
          </span>
        )}
      </button>

      {/* Animació dots */}
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </>
  );
}
