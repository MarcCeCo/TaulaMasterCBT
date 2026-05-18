// src/components/cbt/AppHeader.tsx
// Header compacte — només visible si no hi ha sidebar (layouts sense sidebar)
// o com a topbar en vistes específiques.
import { GitBranch, LogOut, Settings2, Users, Waves } from "lucide-react";
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

  /* Badge de rol */
  const roleBadgeClass = isAdmin
    ? "bg-violet-500/25 text-violet-100 border-violet-400/20"
    : hasAnyEditor
      ? "bg-[#1AAFC0]/20 text-[#8DD9E3] border-[#1AAFC0]/20"
      : "bg-white/10 text-white/50 border-white/10";

  const roleLabel = isAdmin ? "Admin" : hasAnyEditor ? "Editor" : "Visualitzador";

  return (
    <header
      className="sticky top-0 z-40 border-b border-white/8"
      style={{ background: "linear-gradient(135deg, #003D44 0%, #007380 100%)" }}
    >
      <div className="mx-auto max-w-[1600px] px-5 py-2.5 flex items-center gap-3">

        {/* Marca */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="h-9 w-9 rounded-[10px] bg-white/12 border border-white/15 flex items-center justify-center">
            <Waves className="h-5 w-5 text-[#4DC9D8]" />
          </div>
          <div className="hidden sm:block">
            <div className="text-[9px] text-white/40 uppercase tracking-widest font-medium leading-none">
              Consorci
            </div>
            <div className="text-[13px] font-semibold text-white leading-tight tracking-tight">
              Besòs · Tordera
            </div>
          </div>
        </div>

        <div className="h-6 w-px bg-white/12 mx-1 shrink-0" />

        {/* Títol */}
        <div className="flex-1 min-w-0">
          <h1 className="text-[14px] font-semibold tracking-tight text-white leading-tight">
            CBT · TaulaMaster
          </h1>
          <p className="text-[11px] text-white/40 leading-none mt-0.5">
            Gestió d'actius i paràmetres tècnics
          </p>
        </div>

        {/* Accions de navegació ràpida */}
        {canSeeView("gubimclass") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenGubim}
            className="h-8 text-white/60 hover:bg-white/10 hover:text-white border border-white/12 gap-1.5 text-[12px]"
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">GuBIMClass</span>
          </Button>
        )}

        {canSeeView("fields") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenFields}
            className="h-8 text-white/60 hover:bg-white/10 hover:text-white border border-white/12 gap-1.5 text-[12px]"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Diccionari</span>
          </Button>
        )}

        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenUsers}
            className="h-8 text-white/60 hover:bg-white/10 hover:text-white border border-white/12 gap-1.5 text-[12px]"
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Usuaris</span>
          </Button>
        )}

        <div className="h-6 w-px bg-white/12 mx-1 shrink-0" />

        {/* Usuari */}
        <div className="hidden md:flex flex-col items-end shrink-0">
          <span className="text-[12px] text-white/70 font-medium leading-tight">
            {profile?.full_name ?? profile?.email ?? ""}
          </span>
          <Badge className={["text-[9px] px-1.5 py-0 border mt-0.5 font-medium", roleBadgeClass].join(" ")}>
            {roleLabel}
          </Badge>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={signOut}
          className="h-8 w-8 text-white/40 hover:bg-white/10 hover:text-white shrink-0"
          title="Tanca sessió"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
