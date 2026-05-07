import { GitBranch, LogOut, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import logo from "@/assets/Simbol_Web2.png";
import { useAuth } from "@/lib/auth";

interface Props {
  onOpenGubim: () => void;
  onOpenFields: () => void;
  onOpenUsers: () => void;
}

export function AppHeader({ onOpenGubim, onOpenFields, onOpenUsers }: Props) {
  const { profile, isAdmin, canEdit, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b shadow-md" style={{ background: "linear-gradient(135deg, #006E7A 0%, #0099A8 100%)" }}>
      <div className="mx-auto max-w-[1600px] px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="h-10 w-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center shadow-inner">
            <img src={logo} alt="Consorci Besòs Tordera" className="h-9 w-9 object-contain rounded-full" />
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] text-white/70 uppercase tracking-widest font-medium leading-none">Consorci</div>
            <div className="text-sm font-bold text-white leading-tight">Besòs · Tordera</div>
          </div>
        </div>

        <div className="h-8 w-px bg-white/20 mx-1 shrink-0" />

        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-white">CBT · TaulaMaster</h1>
          <p className="text-xs text-white/70">Gestió d'actius i paràmetres tècnics</p>
        </div>

        <Button
          variant="ghost" size="sm"
          onClick={onOpenGubim}
          className="text-white hover:bg-white/15 hover:text-white border border-white/20 gap-1.5"
        >
          <GitBranch className="h-4 w-4" />
          <span className="hidden sm:inline">GuBIMClass</span>
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={onOpenFields}
          className="text-white hover:bg-white/15 hover:text-white border border-white/20 gap-1.5"
        >
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Diccionari de camps</span>
        </Button>

        {isAdmin && (
          <Button
            variant="ghost" size="sm"
            onClick={onOpenUsers}
            className="text-white hover:bg-white/15 hover:text-white border border-white/20 gap-1.5"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Usuaris</span>
          </Button>
        )}

        <div className="h-8 w-px bg-white/20 mx-1 shrink-0" />
        <div className="hidden md:flex flex-col items-end">
          <span className="text-xs text-white/90 font-medium leading-tight">{profile?.full_name ?? profile?.email ?? ""}</span>
          <Badge className={`text-[10px] px-1.5 py-0 border-0 mt-0.5 ${
            isAdmin ? "bg-violet-400/30 text-violet-100" :
            canEdit ? "bg-blue-400/30 text-blue-100" :
            "bg-white/20 text-white/70"
          }`}>
            {isAdmin ? "Admin" : canEdit ? "Editor" : "Visualitzador"}
          </Badge>
        </div>
        <Button
          variant="ghost" size="icon"
          onClick={signOut}
          className="text-white/80 hover:bg-white/15 hover:text-white h-8 w-8"
          title="Tanca sessió"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
