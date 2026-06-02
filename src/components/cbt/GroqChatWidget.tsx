// src/components/cbt/GroqChatWidget.tsx
// Xat de suport flotant alimentat per Groq.
// Apareix a totes les pàgines via TaulaMasterMain.
//
// Novetats respecte la versió anterior:
//  - Llegeix useDataStore() i useProjectes() per enviar dades reals al backend
//  - L'API /api/groq-chat rep el context i l'injecta al system prompt
//  - El Manual BIM es carrega una sola vegada i es manté en estat local
//  - Suggeriments contextuals per secció activa
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from "react";
import { Bot, ChevronDown, Loader2, Send, Sparkles, X, BookOpen } from "lucide-react";
import { useDataStore } from "@/lib/dataStore";
import { useProjectes } from "@/lib/useProjectes";

// ─── Tipus ────────────────────────────────────────────────────────────────────

interface Missatge {
  rol: "user" | "assistant";
  text: string;
  ts: number;
}

interface Props {
  pageContext?: string;   // ID de la secció activa (ex: "equips")
  pageLabel?:  string;   // Nom llegible (ex: "Taula Master")
}

// ─── Suggeriments per secció ──────────────────────────────────────────────────

const SUGGERIMENTS: Record<string, string[]> = {
  dashboard: [
    "Quants equips hi ha en total?",
    "Quins projectes estan actius?",
    "Quin és el GuBIMClass amb més equips?",
  ],
  equips: [
    "Llista'm tots els equips de GuBIMClass BM00",
    "Quins camps té l'equip de bombes centrífugues?",
    "Quins equips no tenen codi assignat?",
  ],
  "revit-bim": [
    "Explica'm el Manual BIM de CBT",
    "Quines famílies Revit hi ha disponibles?",
    "Com creo un fitxer MASTER amb pyRevit?",
  ],
  "visualitzador-3d": [
    "Per què no apareix el model al visor?",
    "Com renovo el token APS?",
    "Quan s'actualitzen els models d'ACC?",
  ],
  "projectes-equips": [
    "Proposa'm un TAG per a una bomba a ED008",
    "Quins TAGs existeixen per a la instal·lació GR001?",
    "Quina diferència hi ha entre duplicitat S i D?",
  ],
  "control-agents": [
    "Com executo l'agent manualment?",
    "Quin agent sincronitza els models 3D?",
    "Com veig l'historial de sincronització?",
  ],
  usuaris: [
    "Quina diferència hi ha entre admin i editor?",
    "Com invito un usuari nou?",
    "Quins rols existeixen a la plataforma?",
  ],
};

const SUGGERIMENTS_DEFECTE = [
  "Explica'm el Manual BIM de CBT",
  "Quins equips hi ha de la família de bombes?",
  "Proposa'm un TAG Rosmiman per a ED008",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHora(ts: number): string {
  return new Date(ts).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" });
}

// ─── Component principal ──────────────────────────────────────────────────────

export function GroqChatWidget({ pageContext, pageLabel }: Props) {
  const [obert, setObert]             = useState(false);
  const [missatges, setMissatges]     = useState<Missatge[]>([]);
  const [input, setInput]             = useState("");
  const [carregant, setCarregant]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [nouMissatge, setNouMissatge] = useState(false);
  const [bimManualText, setBimManualText] = useState<string>("");
  const [carregantManual, setCarregantManual] = useState(false);

  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Accés a les dades de la plataforma ────────────────────────────────────
  const ds        = useDataStore();
  const { projectes } = useProjectes();

  // ── Càrrega del Manual BIM (una sola vegada) ───────────────────────────────
  const carregaManual = useCallback(async () => {
    if (bimManualText || carregantManual) return;
    setCarregantManual(true);
    try {
      const res = await fetch("/api/bim-manual-text");
      if (res.ok) {
        const data = await res.json() as { text?: string };
        if (data.text) setBimManualText(data.text);
      }
    } catch {
      // Si falla no és crític — el backend farà el self-call
    } finally {
      setCarregantManual(false);
    }
  }, [bimManualText, carregantManual]);

  // Carreguem el manual quan l'assistent s'obre per primera vegada
  useEffect(() => {
    if (obert && !bimManualText && !carregantManual) {
      carregaManual();
    }
  }, [obert, bimManualText, carregantManual, carregaManual]);

  // ── Efectes UI ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (obert) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [missatges, obert]);

  useEffect(() => {
    if (obert) setTimeout(() => inputRef.current?.focus(), 150);
  }, [obert]);

  useEffect(() => {
    if (!obert && missatges.length > 0 && missatges.at(-1)?.rol === "assistant") {
      setNouMissatge(true);
    }
  }, [missatges, obert]);

  const obrePanell = () => { setObert(true); setNouMissatge(false); };
  const tancaPanell = () => setObert(false);

  const suggeriments = (pageContext && SUGGERIMENTS[pageContext]) ?? SUGGERIMENTS_DEFECTE;

  // ── Serialització del context de la plataforma ─────────────────────────────
  // Construïm un objecte "context" lleuger que s'enviarà a /api/groq-chat.
  // Evitem enviar dades gegants: limitem els camps i els nodes GuBIM.

  function buildContext() {
    // Equips: enviem tots (la Taula Master sol tenir uns centenars)
    const equipments = ds.equipments.map(e => ({
      equipCode:  e.equipCode,
      equipName:  e.equipName,
      gubimCode:  e.gubimCode,
      fieldCols:  e.fieldCols,
    }));

    // Fields: enviem tots
    const fields = ds.fields.map(f => ({
      col:             f.col,
      codi:            f.codi,
      tipus_dada:      f.tipus_dada,
      cbt:             f.cbt,
      format_param:    f.format_param,
      agrupacio_revit: f.agrupacio_revit,
      disciplina:      f.disciplina,
    }));

    // GuBIMClass: enviem els primers 300 nodes (fulles i branques principals)
    const gubimNodes = ds.gubimNodes.slice(0, 300).map(n => ({
      code: n.code,
      name: n.name,
    }));

    // Projectes: enviem tots els actius amb els seus TAGs
    const projectesCtx = projectes
      .filter(p => p.status === "actiu")
      .map(p => ({
        codiProjecte:      p.codiProjecte,
        nom:               p.nom,
        codisInstallacio:  p.codisInstallacio.map(i =>
          typeof i === "string" ? i : i.codi
        ),
        tags: p.tags.map(t => ({
          tagComplet:      t.tagComplet,
          codiInstallacio: t.codiInstallacio,
          ccm:             t.ccm,
          funcio:          t.funcio,
          duplicitat:      t.duplicitat,
          status:          t.status,
          descripcioEquip: t.descripcioEquip,
        })),
      }));

    return {
      equipments,
      fields,
      gubimNodes,
      projectes:   projectesCtx,
      bimManual:   bimManualText || undefined,
      pageContext:  pageLabel ?? pageContext,
    };
  }

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
          context:  buildContext(),
        }),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string })?.error ?? `Error ${res.status}`);
      }

      const data = await res.json() as { reply: string };
      setMissatges(prev => [
        ...prev,
        { rol: "assistant", text: data.reply, ts: Date.now() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCarregant(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envia(); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Panell de xat ───────────────────────────────────────────────── */}
      <div
        className="fixed bottom-[84px] right-5 z-50 flex flex-col"
        style={{
          width: 360, height: 520,
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
            <div className="flex items-center gap-1.5">
              {pageLabel && (
                <p className="text-white/70 text-[10.5px] truncate">{pageLabel}</p>
              )}
              {/* Indicador de que el Manual BIM és disponible */}
              {bimManualText && (
                <span
                  className="flex items-center gap-0.5 text-[9px] text-white/50"
                  title="Manual BIM carregat"
                >
                  <BookOpen className="h-2.5 w-2.5" />
                  Manual BIM
                </span>
              )}
              {carregantManual && (
                <Loader2 className="h-2.5 w-2.5 text-white/40 animate-spin" />
              )}
            </div>
          </div>
          <button
            onClick={tancaPanell}
            className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ChevronDown className="h-4 w-4 text-white" />
          </button>
        </div>

        {/* Zona de missatges */}
        <div
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,153,168,0.2) transparent" }}
        >
          {missatges.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <div
                className="h-12 w-12 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #EAF8FA, #C8EFF4)" }}
              >
                <Bot className="h-6 w-6" style={{ color: "#0099A8" }} />
              </div>
              <p className="text-sm font-semibold text-slate-700">Com puc ajudar-te?</p>
              <p className="text-[11.5px] text-slate-400 leading-relaxed">
                Tinc accés als equips, camps, projectes, TAGs
                {bimManualText ? " i al Manual BIM" : ""} de la plataforma.
              </p>
              <div className="flex flex-col gap-1.5 w-full mt-1">
                {suggeriments.map(s => (
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

          {missatges.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.rol === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {m.rol === "assistant" && (
                <div
                  className="h-6 w-6 rounded-lg shrink-0 flex items-center justify-center mt-0.5"
                  style={{ background: "linear-gradient(135deg, #0099A8, #007380)" }}
                >
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
                {m.text.split("\n").map((linia, li, arr) => (
                  <span key={li}>
                    {linia}
                    {li < arr.length - 1 && <br />}
                  </span>
                ))}
                <div className={`text-[9.5px] mt-1 ${m.rol === "user" ? "text-white/60 text-right" : "text-slate-400"}`}>
                  {formatHora(m.ts)}
                </div>
              </div>
            </div>
          ))}

          {carregant && (
            <div className="flex gap-2 items-center">
              <div
                className="h-6 w-6 rounded-lg shrink-0 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #0099A8, #007380)" }}
              >
                <Sparkles className="h-3 w-3 text-white" />
              </div>
              <div
                className="px-3 py-2.5 rounded-2xl rounded-bl-md flex gap-1 items-center"
                style={{ background: "#F3F4F2" }}
              >
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "#0099A8", animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div
              className="px-3 py-2 rounded-xl text-[11.5px]"
              style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}
            >
              ❌ {error}
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div
          className="px-3 pb-3 pt-2 shrink-0"
          style={{ borderTop: "1px solid rgba(0,153,168,0.08)" }}
        >
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
          transition: "all 200ms ease",
        }}
        title={obert ? "Tancar assistent" : "Obrir assistent CBT"}
      >
        {obert
          ? <X className="h-5 w-5 text-white" />
          : <Bot className="h-5 w-5 text-white" />}
        {nouMissatge && !obert && (
          <span
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ background: "#EF4444" }}
          >
            !
          </span>
        )}
      </button>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </>
  );
}
