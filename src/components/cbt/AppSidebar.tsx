// src/components/cbt/AppSidebar.tsx  — CBT redesign v2
import { useState } from "react";
import {
  BookOpen,
  Building2,
  FolderOpen,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings2,
  Shield,
  Table2,
  Tags,
  Users,
  X,
  Droplets,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  view?: string;
  section: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
  adminOnly?: boolean;
}

interface Props {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function AppSidebar({ activeSection, onSectionChange }: Props) {
  const { profile, isAdmin, canEditView, canSeeView, signOut } = useAuth();
  const ALL_VIEWS_LIST = ["equips", "gubimclass", "fields", "revit", "projectes", "rosmiman"] as const;
  const hasAnyEditor = ALL_VIEWS_LIST.some((v) => canEditView(v));
  const [mobileOpen, setMobileOpen] = useState(false);

  const groups: NavGroup[] = [
    {
      id: "inici",
      label: "Inici",
      icon: <LayoutDashboard className="h-3.5 w-3.5" />,
      items: [
        { id: "dashboard", label: "Resum general", icon: <LayoutDashboard className="h-[15px] w-[15px]" />, section: "dashboard" },
      ],
    },
    {
      id: "dades",
      label: "Dades",
      icon: <Table2 className="h-3.5 w-3.5" />,
      items: [
        { id: "equips", label: "Taula Master", icon: <Package className="h-[15px] w-[15px]" />, section: "equips", view: "equips" },
      ],
    },
    {
      id: "portal-bim",
      label: "Portal BIM",
      icon: <Building2 className="h-3.5 w-3.5" />,
      items: [
        { id: "revit-bim", label: "Documentació BIM", icon: <BookOpen className="h-[15px] w-[15px]" />, section: "revit-bim", view: "revit" },
      ],
    },
    {
      id: "projectes",
      label: "Projectes",
      icon: <FolderOpen className="h-3.5 w-3.5" />,
      items: [
        { id: "projectes-equips", label: "Llistat de projectes", icon: <FolderOpen className="h-[15px] w-[15px]" />, section: "projectes-equips", view: "projectes" },
      ],
    },
    {
      id: "administracio",
      label: "Administració",
      icon: <Shield className="h-3.5 w-3.5" />,
      items: [
        { id: "usuaris", label: "Gestió d'usuaris", icon: <Users className="h-[15px] w-[15px]" />, section: "usuaris", adminOnly: true },
        { id: "canviapwd", label: "Canvia contrasenya", icon: <KeyRound className="h-[15px] w-[15px]" />, section: "canviapwd" },
      ],
    },
  ];

  const handleItemClick = (item: NavItem) => {
    onSectionChange(item.section);
    setMobileOpen(false);
  };

  const initials = ((profile?.full_name ?? profile?.email ?? "?")[0] ?? "?").toUpperCase();

  const roleBadgeClass = isAdmin
    ? "bg-violet-500/20 text-violet-200 border-violet-400/20"
    : hasAnyEditor
      ? "bg-[#1AAFC0]/20 text-[#8DD9E3] border-[#1AAFC0]/20"
      : "bg-white/10 text-white/40 border-white/10";

  const roleLabel = isAdmin ? "Admin" : hasAnyEditor ? "Editor" : "Visualitzador";

  const SidebarContent = () => (
    <div className="flex flex-col h-full">

      {/* Capçalera */}
      <div
        className="px-4 pt-5 pb-4 flex items-center gap-3 cursor-pointer select-none shrink-0"
        onClick={() => { onSectionChange("dashboard"); setMobileOpen(false); }}
        title="Inici · Resum"
      >
        {/* Logo mark */}
        <div
          className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(135deg, rgba(77,201,216,0.25) 0%, rgba(26,175,192,0.15) 100%)",
            border: "1px solid rgba(77,201,216,0.3)",
            boxShadow: "0 0 16px rgba(77,201,216,0.12)",
          }}
        >
          <Droplets className="h-[18px] w-[18px]" style={{ color: "#4DC9D8" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-semibold tracking-[0.16em] uppercase leading-none mb-[3px]" style={{ color: "rgba(77,201,216,0.6)" }}>
            Consorci
          </div>
          <div className="text-[13px] font-bold leading-tight tracking-tight text-white truncate">
            Besòs · Tordera
          </div>
          <div className="text-[10px] leading-tight mt-[1px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            TaulaMaster
          </div>
        </div>
        <button
          className="lg:hidden text-white/30 hover:text-white/70 transition-colors ml-1 shrink-0"
          onClick={(e) => { e.stopPropagation(); setMobileOpen(false); }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Separator */}
      <div className="mx-3 mb-3" style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto pb-3 px-2 space-y-0.5 scrollbar-none">
        {groups.map((group) => {
          if (group.adminOnly && !isAdmin) return null;

          const visibleItems = group.items.filter((item) => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.view && !canSeeView(item.view as Parameters<typeof canSeeView>[0])) return false;
            return true;
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.id} className="mb-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 mb-1"
                style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>
                <span style={{ color: "rgba(255,255,255,0.2)" }}>{group.icon}</span>
                <span>{group.label}</span>
              </div>

              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = activeSection === item.section;
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        "relative w-full flex items-center gap-2.5 px-3 py-[8px] rounded-[8px]",
                        "text-[12.5px] font-medium transition-all duration-150 text-left",
                        isActive
                          ? "cbt-sidebar-active-bar"
                          : ""
                      )}
                      style={isActive ? {
                        background: "rgba(77,201,216,0.12)",
                        color: "#fff",
                        boxShadow: "inset 0 0 0 1px rgba(77,201,216,0.15)",
                      } : {
                        color: "rgba(255,255,255,0.45)",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)";
                        }
                      }}
                      onClick={() => handleItemClick(item)}
                    >
                      <span style={{ color: isActive ? "#4DC9D8" : "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                      {isActive && (
                        <span className="ml-auto shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: "#4DC9D8" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Peu d'usuari */}
      <div className="mx-2 mb-3 rounded-[10px] p-2.5"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 font-bold text-[11.5px]"
            style={{
              background: "linear-gradient(135deg, #005A63, #0099A8)",
              color: "#fff",
              border: "1.5px solid rgba(77,201,216,0.3)",
            }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] font-semibold text-white/70 truncate leading-tight">
              {profile?.full_name ?? profile?.email ?? ""}
            </div>
            <Badge className={cn("text-[9px] px-1.5 py-0 border mt-0.5 font-semibold", roleBadgeClass)}>
              {roleLabel}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            title="Tanca sessió"
            className="h-7 w-7 text-white/25 hover:text-white/60 hover:bg-white/8 shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Hamburger mòbil */}
      <button
        className={cn(
          "lg:hidden fixed top-3.5 left-3.5 z-50 h-9 w-9 rounded-xl",
          "shadow-lg border flex items-center justify-center transition-colors"
        )}
        style={{ background: "#001F23", borderColor: "rgba(77,201,216,0.2)", color: "rgba(255,255,255,0.7)" }}
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      {/* Drawer mòbil */}
      <div
        className={cn("lg:hidden fixed top-0 left-0 z-50 h-full w-60 transition-transform duration-200 cbt-sidebar-bg")}
        style={{ transform: mobileOpen ? "translateX(0)" : "translateX(-100%)" }}
      >
        <SidebarContent />
      </div>

      {/* Sidebar escriptori */}
      <aside
        className="hidden lg:flex flex-col w-[230px] shrink-0 h-screen sticky top-0 cbt-sidebar-bg"
      >
        <SidebarContent />
      </aside>
    </>
  );
}
