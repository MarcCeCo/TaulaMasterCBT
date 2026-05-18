// src/components/cbt/AppSidebar.tsx
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
  Waves,
  X,
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
        {
          id: "dashboard",
          label: "Resum general",
          icon: <LayoutDashboard className="h-4 w-4" />,
          section: "dashboard",
        },
      ],
    },
    {
      id: "dades",
      label: "Dades",
      icon: <Table2 className="h-3.5 w-3.5" />,
      items: [
        {
          id: "equips",
          label: "Taula Master",
          icon: <Package className="h-4 w-4" />,
          section: "equips",
          view: "equips",
        },
        {
          id: "gubimclass",
          label: "GuBIMClass",
          icon: <GitBranch className="h-4 w-4" />,
          section: "gubimclass",
          view: "gubimclass",
        },
        {
          id: "camps",
          label: "Diccionari de camps",
          icon: <Settings2 className="h-4 w-4" />,
          section: "camps",
          view: "fields",
        },
      ],
    },
    {
      id: "portal-bim",
      label: "Portal BIM",
      icon: <Building2 className="h-3.5 w-3.5" />,
      items: [
        {
          id: "revit-bim",
          label: "Documentació BIM",
          icon: <BookOpen className="h-4 w-4" />,
          section: "revit-bim",
          view: "revit",
        },
      ],
    },
    {
      id: "projectes",
      label: "Projectes",
      icon: <FolderOpen className="h-3.5 w-3.5" />,
      items: [
        {
          id: "projectes-equips",
          label: "Projectes",
          icon: <FolderOpen className="h-4 w-4" />,
          section: "projectes-equips",
          view: "projectes",
        },
        {
          id: "rosmiman",
          label: "TAGs Rosmiman",
          icon: <Tags className="h-4 w-4" />,
          section: "rosmiman",
          view: "rosmiman",
        },
      ],
    },
    {
      id: "administracio",
      label: "Administració",
      icon: <Shield className="h-3.5 w-3.5" />,
      items: [
        {
          id: "usuaris",
          label: "Gestió d'usuaris",
          icon: <Users className="h-4 w-4" />,
          section: "usuaris",
          adminOnly: true,
        },
        {
          id: "canviapwd",
          label: "Canvia contrasenya",
          icon: <KeyRound className="h-4 w-4" />,
          section: "canviapwd",
        },
      ],
    },
  ];

  const handleItemClick = (item: NavItem) => {
    onSectionChange(item.section);
    setMobileOpen(false);
  };

  /* Avatar inicial */
  const initials = ((profile?.full_name ?? profile?.email ?? "?")[0] ?? "?").toUpperCase();

  /* Badge de rol */
  const roleBadgeClass = isAdmin
    ? "bg-violet-500/20 text-violet-200 border-violet-400/20"
    : hasAnyEditor
      ? "bg-[#1AAFC0]/20 text-[#8DD9E3] border-[#1AAFC0]/20"
      : "bg-white/10 text-white/50 border-white/10";

  const roleLabel = isAdmin ? "Admin" : hasAnyEditor ? "Editor" : "Visualitzador";

  /* ─ Contingut del sidebar ─────────────────────────────────────────── */
  const SidebarContent = () => (
    <div className="flex flex-col h-full">

      {/* Capçalera / marca */}
      <div
        className="px-4 py-[18px] flex items-center gap-3 border-b border-white/8 cursor-pointer select-none shrink-0"
        onClick={() => { onSectionChange("dashboard"); setMobileOpen(false); }}
        title="Inici · Resum"
      >
        <div className="h-9 w-9 rounded-[10px] bg-white/12 border border-white/18 flex items-center justify-center shrink-0">
          <Waves className="h-5 w-5 text-[#4DC9D8]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9.5px] font-medium tracking-[0.14em] uppercase text-white/40 leading-tight">
            Consorci
          </div>
          <div className="text-[13.5px] font-semibold text-white leading-tight tracking-tight truncate">
            Besòs · Tordera
          </div>
          <div className="text-[10px] text-white/35 leading-tight">
            TaulaMaster
          </div>
        </div>
        <button
          className="lg:hidden text-white/40 hover:text-white/80 transition-colors ml-1 shrink-0"
          onClick={(e) => { e.stopPropagation(); setMobileOpen(false); }}
          aria-label="Tanca el menú"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navegació */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 scrollbar-none">
        {groups.map((group) => {
          if (group.adminOnly && !isAdmin) return null;

          const visibleItems = group.items.filter((item) => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.view && !canSeeView(item.view as Parameters<typeof canSeeView>[0])) return false;
            return true;
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.id} className="mb-3">
              {/* Etiqueta de grup */}
              <div className="flex items-center gap-1.5 px-2.5 py-2 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/35">
                <span className="text-white/30">{group.icon}</span>
                <span>{group.label}</span>
              </div>

              {/* Items */}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = activeSection === item.section;
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        "relative w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-[6px]",
                        "text-[13px] font-normal transition-all duration-150 text-left",
                        isActive
                          ? "bg-white/10 text-white font-medium cbt-sidebar-active-bar"
                          : "text-white/50 hover:bg-white/7 hover:text-white/80"
                      )}
                      onClick={() => handleItemClick(item)}
                    >
                      <span className={cn(
                        "shrink-0 transition-colors",
                        isActive ? "text-[#4DC9D8]" : "text-white/30"
                      )}>
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Peu d'usuari */}
      <div className="px-3 py-3 border-t border-white/8 shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          <div className="h-8 w-8 rounded-full bg-white/12 border border-white/15 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-semibold text-white/80">{initials}</span>
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-white/70 font-medium truncate leading-tight">
              {profile?.full_name ?? profile?.email ?? ""}
            </div>
            <Badge className={cn("text-[9px] px-1.5 py-0 border mt-0.5 font-medium", roleBadgeClass)}>
              {roleLabel}
            </Badge>
          </div>
          {/* Logout */}
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            title="Tanca sessió"
            className="h-7 w-7 text-white/30 hover:text-white/70 hover:bg-white/8 shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Botó hamburguesa (mòbil) */}
      <button
        className={cn(
          "lg:hidden fixed top-3.5 left-3.5 z-50 h-9 w-9 rounded-lg",
          "bg-[#003D44] shadow-md border border-white/10",
          "flex items-center justify-center text-white/70 hover:text-white transition-colors"
        )}
        onClick={() => setMobileOpen(true)}
        aria-label="Obre el menú"
      >
        <Menu className="h-4.5 w-4.5" />
      </button>

      {/* Overlay mòbil */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Drawer mòbil */}
      <div
        className={cn(
          "lg:hidden fixed top-0 left-0 z-50 h-full w-60 transition-transform duration-200",
          "bg-[#003D44]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent />
      </div>

      {/* Sidebar escriptori */}
      <aside
        className="hidden lg:flex flex-col w-[224px] shrink-0 h-screen sticky top-0"
        style={{ background: "var(--cbt-900, #003D44)" }}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
