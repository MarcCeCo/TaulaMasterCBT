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
