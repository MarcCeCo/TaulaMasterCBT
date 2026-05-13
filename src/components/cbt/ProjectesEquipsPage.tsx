// src/components/cbt/ProjectesEquipsPage.tsx
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Upload,
  FileEdit,
  Tags,
  Wrench,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── tipus ───────────────────────────────────────────────────────────────────
type StepId =
  | "creacio"
  | "revisio1"
  | "correcte1"
  | "genera_detalls"
  | "revisio2"
  | "correcte2"
  | "rosmiman"
  | "correccions"
  | "modificacio";

interface Step {
  id: StepId;
  label: string;
  description: string;
  type: "start" | "process" | "decision" | "end" | "action";
  icon: React.ReactNode;
}

const STEPS: Step[] = [
  {
    id: "creacio",
    label: "Creació TAGS nous",
    description: "Es creen nous tags associats a equips de projectes.",
    type: "start",
    icon: <Tags className="h-5 w-5" />,
  },
  {
    id: "revisio1",
    label: "Revisió",
    description: "L'agent responsable revisa els tags creats.",
    type: "process",
    icon: <RefreshCw className="h-5 w-5" />,
  },
  {
    id: "correcte1",
    label: "És correcte?",
    description: "Es valida si els camps i valors dels tags són correctes.",
    type: "decision",
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
  {
    id: "genera_detalls",
    label: "Generació de detalls",
    description:
      "Es generen els detalls dels quips nous perquè l'agent implicat ompli els valors dels camps.",
    type: "action",
    icon: <FileEdit className="h-5 w-5" />,
  },
  {
    id: "revisio2",
    label: "Revisió detalls",
    description: "Es revisen els detalls i valors de camps introduïts.",
    type: "process",
    icon: <RefreshCw className="h-5 w-5" />,
  },
  {
    id: "correcte2",
    label: "És correcte?",
    description: "Es valida si tots els detalls i valors introduïts són correctes.",
    type: "decision",
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
  {
    id: "rosmiman",
    label: "Càrrega a ROSMIMAN",
    description: "Les dades validades es carreguen al sistema ROSMIMAN.",
    type: "end",
    icon: <Upload className="h-5 w-5" />,
  },
  {
    id: "correccions",
    label: "Aplicar correccions",
    description: "S'apliquen les correccions indicades a la revisió.",
    type: "action",
    icon: <Wrench className="h-5 w-5" />,
  },
  {
    id: "modificacio",
    label: "Modificació / Comentaris",
    description: "Es modifiquen els tags i s'afegeixen comentaris de revisió.",
    type: "action",
    icon: <FileEdit className="h-5 w-5" />,
  },
];

const COLOR = {
  start: {
    bg: "bg-[#0099A8]/10",
    border: "border-[#0099A8]/30",
    icon: "text-[#0099A8]",
    badge: "bg-[#0099A8]/15 text-[#006E7A]",
    ring: "ring-[#0099A8]/40",
  },
  process: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "text-blue-500",
    badge: "bg-blue-100 text-blue-700",
    ring: "ring-blue-300",
  },
  decision: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: "text-amber-500",
    badge: "bg-amber-100 text-amber-700",
    ring: "ring-amber-300",
  },
  end: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700",
    ring: "ring-emerald-300",
  },
  action: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    icon: "text-violet-500",
    badge: "bg-violet-100 text-violet-700",
    ring: "ring-violet-300",
  },
} as const;

const TYPE_LABEL: Record<Step["type"], string> = {
  start: "Inici",
  process: "Procés",
  decision: "Decisió",
  end: "Fi",
  action: "Acció",
};

type FlowState =
  | "idle"
  | "creacio"
  | "revisio1"
  | "wait_correcte1"
  | "genera_detalls"
  | "revisio2"
  | "wait_correcte2"
  | "correccions"
  | "modificacio"
  | "rosmiman"
  | "done";

function StepNode({
  step,
  active,
  done,
  onClick,
}: {
  step: Step;
  active: boolean;
  done: boolean;
  onClick?: () => void;
}) {
  const c = COLOR[step.type];
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 w-36 text-center",
        c.bg,
        c.border,
        active && `ring-2 ${c.ring} scale-105 shadow-md`,
        done && "opacity-60",
        onClick ? "cursor-pointer hover:scale-105 hover:shadow-md" : "cursor-default"
      )}
    >
      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", c.bg, c.icon)}>
        {done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : step.icon}
      </div>
      <span className="text-xs font-semibold text-slate-700 leading-tight">{step.label}</span>
      <Badge className={cn("text-[9px] px-1.5 py-0 border-0", c.badge)}>
        {TYPE_LABEL[step.type]}
      </Badge>
    </button>
  );
}

function Arrow({ label, vertical = false, color = "slate" }: { label?: string; vertical?: boolean; color?: "slate" | "green" | "red" }) {
  const col = color === "green" ? "text-emerald-500" : color === "red" ? "text-red-400" : "text-slate-400";
  return vertical ? (
    <div className={cn("flex flex-col items-center gap-0.5 my-1", col)}>
      {label && <span className="text-[10px] font-medium text-slate-500">{label}</span>}
      <ChevronRight className="h-4 w-4 rotate-90" />
    </div>
  ) : (
    <div className={cn("flex items-center gap-0.5 mx-1", col)}>
      {label && <span className="text-[10px] font-medium text-slate-500">{label}</span>}
      <ChevronRight className="h-4 w-4" />
    </div>
  );
}

export function ProjectesEquipsPage() {
  const [flow, setFlow] = useState<FlowState>("idle");
  const [activeStep, setActiveStep] = useState<StepId | null>(null);
  const [doneSteps, setDoneSteps] = useState<Set<StepId>>(new Set());
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);

  const markDone = (id: StepId) => setDoneSteps((prev) => new Set([...prev, id]));

  const advance = (next: FlowState, stepId: StepId) => {
    if (activeStep) markDone(activeStep);
    setActiveStep(stepId);
    setFlow(next);
  };

  const startFlow = () => {
    setFlow("creacio");
    setActiveStep("creacio");
    setDoneSteps(new Set());
    setSelectedStep(null);
  };

  const resetFlow = () => {
    setFlow("idle");
    setActiveStep(null);
    setDoneSteps(new Set());
    setSelectedStep(null);
  };

  const s = (id: StepId) => STEPS.find((x) => x.id === id)!;
  const infoStep = selectedStep ?? (activeStep ? s(activeStep) : null);

  return (
    <div className="space-y-6">
      {/* Capçalera */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Llistat d'equips per projectes
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Flux de treball per a la creació i validació de tags d'equips de projectes
          </p>
        </div>
        <div className="flex gap-2">
          {flow !== "idle" && (
            <Button variant="outline" size="sm" onClick={resetFlow} className="text-slate-500 border-slate-200">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reiniciar
            </Button>
          )}
          {flow === "idle" && (
            <Button size="sm" onClick={startFlow} className="bg-[#0099A8] hover:bg-[#006E7A] text-white">
              Simular flux
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ── Diagrama ── */}
        <Card className="lg:col-span-2 p-6 border-0 shadow-sm bg-white overflow-x-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-5">
            Diagrama de flux · Tags d'equips
          </p>

          {/* Fila 1 */}
          <div className="flex items-center justify-center flex-wrap gap-1 mb-2">
            <StepNode step={s("creacio")} active={activeStep === "creacio"} done={doneSteps.has("creacio")} onClick={() => setSelectedStep(s("creacio"))} />
            <Arrow label="revisió" />
            <StepNode step={s("revisio1")} active={activeStep === "revisio1"} done={doneSteps.has("revisio1")} onClick={() => setSelectedStep(s("revisio1"))} />
            <Arrow label="revisió" />
            <StepNode step={s("correcte1")} active={activeStep === "correcte1" || flow === "wait_correcte1"} done={doneSteps.has("correcte1")} onClick={() => setSelectedStep(s("correcte1"))} />
          </div>

          {/* Bifurcació 1 */}
          <div className="flex items-start justify-center gap-8 mt-1 mb-2">
            <div className="flex flex-col items-center gap-1">
              <Arrow vertical label="no" color="red" />
              <StepNode step={s("modificacio")} active={activeStep === "modificacio"} done={doneSteps.has("modificacio")} onClick={() => setSelectedStep(s("modificacio"))} />
            </div>
            <div className="flex flex-col items-center gap-1">
              <Arrow vertical label="sí" color="green" />
              <StepNode step={s("genera_detalls")} active={activeStep === "genera_detalls"} done={doneSteps.has("genera_detalls")} onClick={() => setSelectedStep(s("genera_detalls"))} />
              <Arrow vertical label="revisió" />
              <StepNode step={s("revisio2")} active={activeStep === "revisio2"} done={doneSteps.has("revisio2")} onClick={() => setSelectedStep(s("revisio2"))} />
              <Arrow vertical label="revisió" />
              <StepNode step={s("correcte2")} active={activeStep === "correcte2" || flow === "wait_correcte2"} done={doneSteps.has("correcte2")} onClick={() => setSelectedStep(s("correcte2"))} />
            </div>
          </div>

          {/* Bifurcació 2 */}
          <div className="flex items-start justify-center gap-8 mt-1">
            <div className="w-36" />
            <div className="flex items-start gap-6">
              <div className="flex flex-col items-center gap-1">
                <Arrow vertical label="no" color="red" />
                <StepNode step={s("correccions")} active={activeStep === "correccions"} done={doneSteps.has("correccions")} onClick={() => setSelectedStep(s("correccions"))} />
              </div>
              <div className="flex flex-col items-center gap-1">
                <Arrow vertical label="sí" color="green" />
                <StepNode step={s("rosmiman")} active={activeStep === "rosmiman"} done={doneSteps.has("rosmiman")} onClick={() => setSelectedStep(s("rosmiman"))} />
              </div>
            </div>
          </div>

          {/* Llegenda */}
          <div className="mt-5 flex flex-wrap gap-3 justify-center text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-300" />No → torna al bucle anterior</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />Sí → avança al pas següent</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#0099A8]" />Pas actiu a la simulació</span>
          </div>
        </Card>

        {/* ── Panell lateral ── */}
        <div className="flex flex-col gap-4">
          <Card className="p-4 border-0 shadow-sm bg-white flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Detall del pas</p>
            {infoStep ? (
              <div className="space-y-3">
                <div className={cn("h-12 w-12 rounded-full flex items-center justify-center", COLOR[infoStep.type].bg, COLOR[infoStep.type].icon)}>
                  {infoStep.icon}
                </div>
                <div>
                  <p className="font-semibold text-slate-700">{infoStep.label}</p>
                  <Badge className={cn("text-[9px] px-1.5 py-0 border-0 mt-1", COLOR[infoStep.type].badge)}>{TYPE_LABEL[infoStep.type]}</Badge>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">{infoStep.description}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Fes clic sobre un pas per veure'n el detall, o simula el flux amb el botó superior.</p>
            )}
          </Card>

          {/* Controls simulació */}
          {flow !== "idle" && flow !== "done" && (
            <Card className="p-4 border-0 shadow-sm bg-white">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Simulació</p>
              <div className="space-y-2">
                {flow === "creacio" && (
                  <Button size="sm" className="w-full bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={() => advance("revisio1", "revisio1")}>
                    Enviar a revisió
                  </Button>
                )}
                {flow === "revisio1" && (
                  <Button size="sm" className="w-full bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={() => advance("wait_correcte1", "correcte1")}>
                    Completar revisió
                  </Button>
                )}
                {flow === "wait_correcte1" && (
                  <>
                    <p className="text-xs text-slate-500 mb-2">Els tags revisats, <strong>és correcte?</strong></p>
                    <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => advance("genera_detalls", "genera_detalls")}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Sí, és correcte
                    </Button>
                    <Button size="sm" variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50" onClick={() => advance("modificacio", "modificacio")}>
                      <XCircle className="h-3.5 w-3.5 mr-1.5" /> No, cal modificar
                    </Button>
                  </>
                )}
                {flow === "modificacio" && (
                  <Button size="sm" className="w-full bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={() => {
                    markDone("modificacio");
                    setDoneSteps(new Set());
                    setActiveStep("creacio");
                    setFlow("creacio");
                  }}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Tornar a revisió
                  </Button>
                )}
                {flow === "genera_detalls" && (
                  <Button size="sm" className="w-full bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={() => advance("revisio2", "revisio2")}>
                    Generar detalls
                  </Button>
                )}
                {flow === "revisio2" && (
                  <Button size="sm" className="w-full bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={() => advance("wait_correcte2", "correcte2")}>
                    Completar revisió detalls
                  </Button>
                )}
                {flow === "wait_correcte2" && (
                  <>
                    <p className="text-xs text-slate-500 mb-2">Els detalls revisats, <strong>és correcte?</strong></p>
                    <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => advance("rosmiman", "rosmiman")}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Sí, carregar a ROSMIMAN
                    </Button>
                    <Button size="sm" variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50" onClick={() => advance("correccions", "correccions")}>
                      <XCircle className="h-3.5 w-3.5 mr-1.5" /> No, aplicar correccions
                    </Button>
                  </>
                )}
                {flow === "correccions" && (
                  <Button size="sm" className="w-full bg-[#0099A8] hover:bg-[#006E7A] text-white" onClick={() => {
                    markDone("correccions");
                    setActiveStep("genera_detalls");
                    setFlow("genera_detalls");
                  }}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Tornar a generar detalls
                  </Button>
                )}
                {flow === "rosmiman" && (
                  <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                    markDone("rosmiman");
                    setFlow("done");
                    setActiveStep(null);
                  }}>
                    <Upload className="h-3.5 w-3.5 mr-1.5" /> Confirmar càrrega
                  </Button>
                )}
              </div>
            </Card>
          )}

          {flow === "done" && (
            <Card className="p-4 border-0 shadow-sm bg-emerald-50 border border-emerald-200">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <p className="text-sm font-semibold">Flux completat correctament</p>
              </div>
              <p className="text-xs text-emerald-600 mt-1">Les dades s'han carregat a ROSMIMAN.</p>
              <Button size="sm" variant="outline" onClick={resetFlow} className="mt-3 w-full border-emerald-300 text-emerald-700">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Nou flux
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
