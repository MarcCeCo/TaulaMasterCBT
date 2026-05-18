// src/components/cbt/AppHeader.tsx — CBT redesign v2
import { GitBranch, LogOut, Settings2, Users, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";

interface Props {
  onOpenGubim: () => void;
  onOpenFields: () => void;
  onOpenUsers: () => void;
}

export function AppHeader({ onOpenGubim, onOpenFields, onOpenUsers }: Props) {
  const { profile, isAdmin, canEditView, canSeeView, signOut } = useAuth();
  const ALL_VIEWS_LIST = ["equips", "gubimclass", "fields", "revit", "projectes", "rosmiman"] as const;
  const hasAnyEditor = ALL_VIEWS_LIST.some((v) => canEditView(v));

  const roleBadgeClass = isAdmin
    ? "bg-violet-500/25 text-violet-100 border-violet-400/20"
    : hasAnyEditor
      ? "bg-[#1AAFC0]/20 text-[#8DD9E3] border-[#1AAFC0]/20"
      : "bg-white/10 text-white/50 border-white/10";

  const roleLabel = isAdmin ? "Admin" : hasAnyEditor ? "Editor" : "Visualitzador";

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: "linear-gradient(135deg, #001F23 0%, #003D44 60%, #005A63 100%)",
        borderBottom: "1px solid rgba(77,201,216,0.1)",
        boxShadow: "0 2px 8px rgba(0,31,35,0.2)",
      }}
    >
      <div className="mx-auto max-w-[1600px] px-5 py-2.5 flex items-center gap-3">

        {/* Marca */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(77,201,216,0.15)",
              border: "1px solid rgba(77,201,216,0.25)",
            }}
          >
            <Droplets className="h-[18px] w-[18px]" style={{ color: "#4DC9D8" }} />
          </div>
          <div className="hidden sm:block">
            <div className="leading-none mb-[2px]" style={{ fontSize: "8.5px", fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: "rgba(77,201,216,0.6)" }}>
              Consorci
            </div>
            <div className="text-[13px] font-bold text-white leading-tight tracking-tight">
              Besòs · Tordera
            </div>
          </div>
        </div>

        <div className="h-5 w-px mx-1 shrink-0" style={{ background: "rgba(255,255,255,0.1)" }} />

        {/* Títol */}
        <div className="flex-1 min-w-0">
          <h1 className="text-[13.5px] font-bold tracking-tight text-white leading-tight">
            CBT · TaulaMaster
          </h1>
          <p className="text-[10.5px] leading-none mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            Gestió d'actius i paràmetres tècnics
          </p>
        </div>

        {/* Botons de navegació */}
        {canSeeView("gubimclass") && (
          <Button
            variant="ghost" size="sm" onClick={onOpenGubim}
            className="h-8 gap-1.5 text-[11.5px] font-semibold"
            style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">GuBIMClass</span>
          </Button>
        )}

        {canSeeView("fields") && (
          <Button
            variant="ghost" size="sm" onClick={onOpenFields}
            className="h-8 gap-1.5 text-[11.5px] font-semibold"
            style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Diccionari</span>
          </Button>
        )}

        {isAdmin && (
          <Button
            variant="ghost" size="sm" onClick={onOpenUsers}
            className="h-8 gap-1.5 text-[11.5px] font-semibold"
            style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Usuaris</span>
          </Button>
        )}

        <div className="h-5 w-px mx-1 shrink-0" style={{ background: "rgba(255,255,255,0.1)" }} />

        {/* Usuari */}
        <div className="hidden md:flex flex-col items-end shrink-0">
          <span className="text-[11.5px] text-white/70 font-semibold leading-tight">
            {profile?.full_name ?? profile?.email ?? ""}
          </span>
          <Badge className={["text-[9px] px-1.5 py-0 border mt-0.5 font-bold", roleBadgeClass].join(" ")}>
            {roleLabel}
          </Badge>
        </div>

        <Button
          variant="ghost" size="icon" onClick={signOut}
          className="h-8 w-8 shrink-0"
          style={{ color: "rgba(255,255,255,0.35)", borderRadius: "8px" }}
          title="Tanca sessió"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
