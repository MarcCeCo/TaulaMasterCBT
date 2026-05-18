// src/components/cbt/AppSidebar.tsx
import { useState } from "react";
import {
  BookOpen,
  Building2,
  FolderOpen,
  GitBranch,
  KeyRound,
  LogOut,
  Menu,
  Package,
  Settings2,
  Shield,
  Table2,
  Users,
  LayoutDashboard,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import logo from "@/assets/Simbol_Web2.png";
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
      icon: <LayoutDashboard className="h-4 w-4" />,
      items: [
        {
          id: "dashboard",
          label: "Resum",
          icon: <LayoutDashboard className="h-4 w-4" />,
          section: "dashboard",
        },
      ],
    },
    {
      id: "dades",
      label: "Dades",
      icon: <Table2 className="h-4 w-4" />,
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
      icon: <Building2 className="h-4 w-4" />,
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
      icon: <FolderOpen className="h-4 w-4" />,
      items: [
        {
          id: "projectes-equips",
          label: "Projectes",
          icon: <FolderOpen className="h-4 w-4" />,
          section: "projectes-equips",
          view: "projectes",
        },
      ],
    },
    {
      id: "administracio",
      label: "Administració",
      icon: <Shield className="h-4 w-4" />,
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

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        className="px-4 py-5 flex items-center gap-3 border-b border-white/10 cursor-pointer"
        style={{ background: "linear-gradient(135deg, #006E7A 0%, #0099A8 100%)" }}
        onClick={() => { onSectionChange("dashboard"); setMobileOpen(false); }}
        title="Inici · Resum"
      >
        <div className="h-10 w-10 rounded-full overflow-hidden bg-white/15 flex items-center justify-center shadow-inner shrink-0">
          <img src={logo} alt="CBT" className="h-9 w-9 object-contain rounded-full" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-white/60 uppercase tracking-widest font-medium leading-none">Consorci</div>
          <div className="text-sm font-bold text-white leading-tight truncate">Besòs · Tordera</div>
          <div className="text-[10px] text-white/60 leading-tight">TaulaMaster</div>
        </div>
        <button className="lg:hidden text-white/70 hover:text-white ml-1" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {groups.map((group) => {
          if (group.adminOnly && !isAdmin) return null;

          const visibleItems = group.items.filter((item) => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.view && !canSeeView(item.view as Parameters<typeof canSeeView>[0])) return false;
            return true;
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.id}>
              <div className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#006E7A]">
                <span className="text-[#0099A8]">{group.icon}</span>
                <span className="flex-1 text-left">{group.label}</span>
              </div>
              <div className="ml-2 mt-0.5 space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = activeSection === item.section;
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all",
                        isActive
                          ? "bg-[#0099A8]/12 text-[#006E7A] font-semibold"
                          : "text-slate-600 hover:bg-slate-100 hover:text-[#006E7A]"
                      )}
                      onClick={() => handleItemClick(item)}
                    >
                      <span className={cn("shrink-0", isActive ? "text-[#0099A8]" : "text-slate-400")}>
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

      {/* User footer */}
      <div className="border-t border-slate-100 px-3 py-3 bg-slate-50/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-full bg-[#0099A8]/15 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-[#006E7A]">
              {((profile?.full_name ?? profile?.email ?? "")[0] ?? "?").toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-700 truncate">
              {profile?.full_name ?? profile?.email ?? ""}
            </div>
            <Badge
              className={cn(
                "text-[9px] px-1.5 py-0 border-0 mt-0.5",
                isAdmin ? "bg-violet-100 text-violet-700"
                  : hasAnyEditor ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-500"
              )}
            >
              {isAdmin ? "Admin" : hasAnyEditor ? "Editor" : "Visualitzador"}
            </Badge>
          </div>
          <Button
            variant="ghost" size="icon" onClick={signOut}
            className="h-7 w-7 text-slate-400 hover:text-slate-700 hover:bg-slate-200 shrink-0"
            title="Tanca sessió"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        className="lg:hidden fixed top-4 left-4 z-50 h-9 w-9 rounded-md bg-white shadow-md border border-slate-200 flex items-center justify-center text-[#006E7A]"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
      )}

      <div
        className={cn(
          "lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white shadow-xl transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent />
      </div>

      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-slate-200 bg-white h-screen sticky top-0">
        <SidebarContent />
      </aside>
    </>
  );
}
