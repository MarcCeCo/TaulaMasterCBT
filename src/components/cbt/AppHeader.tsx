// src/components/cbt/AppHeader.tsx  (versió actualitzada amb auth)

import { useState } from "react";
import { GitBranch, Settings2, LogOut, Users, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, ROLE_LABELS, ROLE_COLORS } from "@/lib/auth";
import { UserManagerDialog } from "@/components/auth/UserManagerDialog";
import logo from "@/assets/Simbol_Web2.png";

interface Props {
  onOpenGubim: () => void;
  onOpenFields: () => void;
}

export function AppHeader({ onOpenGubim, onOpenFields }: Props) {
  const { profile, isAdmin, signOut } = useAuth();
  const [userManager, setUserManager] = useState(false);

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b shadow-md"
        style={{ background: "linear-gradient(135deg, #006E7A 0%, #0099A8 100%)" }}
      >
        <div className="mx-auto max-w-[1600px] px-6 py-3 flex items-center gap-4">
          {/* Logo */}
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

          {/* Títol */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-white">CBT · TaulaMaster</h1>
            <p className="text-xs text-white/70">Gestió d'actius i paràmetres tècnics</p>
          </div>

          {/* Botons acció (només editor/admin) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenGubim}
            className="text-white hover:bg-white/15 hover:text-white border border-white/20 gap-1.5"
          >
            <GitBranch className="h-4 w-4" />
            <span className="hidden sm:inline">GuBIMClass</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenFields}
            className="text-white hover:bg-white/15 hover:text-white border border-white/20 gap-1.5"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Diccionari de camps</span>
          </Button>

          {/* Menú usuari */}
          {profile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/15 hover:text-white border border-white/20 gap-1.5 max-w-[200px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">
                      {(profile.full_name || profile.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden md:inline truncate text-xs">
                      {profile.full_name || profile.email}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium truncate">{profile.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                  <Badge className={`mt-1.5 text-[10px] px-1.5 py-0 ${ROLE_COLORS[profile.role]} border-0`}>
                    {ROLE_LABELS[profile.role]}
                  </Badge>
                </div>
                <DropdownMenuSeparator />
                {isAdmin && (
                  <>
                    <DropdownMenuItem onClick={() => setUserManager(true)} className="gap-2">
                      <Users className="h-4 w-4" />
                      Gestió d'usuaris
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={signOut}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Tancar sessió
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <UserManagerDialog open={userManager} onOpenChange={setUserManager} />
    </>
  );
}
