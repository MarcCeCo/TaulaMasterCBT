// src/components/cbt/AppSidebar.tsx
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Database,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Package,
  Settings2,
  Shield,
  Users,
  X,
  Menu,
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
  onClick?: () => void;
  adminOnly?: boolean;
  editorOnly?: boolean;
  view?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
  adminOnly?: boolean;
  topLevelView?: string; // si informat, la capçalera del grup és clicable i navega a aquesta secció
}

interface Props {
  activeSection: string;
  onSectionChange: (section: string) => void;
  onOpenGubim: () => void;
  onOpenFields: () => void;
  onOpenUsers: () => void;
}

export function AppSidebar({
  activeSection,
  onSectionChange,
  onOpenGubim,
  onOpenFields,
  onOpenUsers,
}: Props) {
  const { profile, isAdmin, canEdit, canSeeView, signOut } = useAuth();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    taulaMaster: true,
    administracio: true,
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const groups: NavGroup[] = [
    {
      id: "taulaMaster",
      label: "Taula Master",
      icon: <Database className="h-4 w-4" />,
      topLevelView: "equips",
      items: [
        {
          id: "dashboard",
          label: "Resum",
          icon: <LayoutDashboard className="h-4 w-4" />,
          view: "equips",
        },
        {
          id: "gubimclass",
          label: "GuBIMClass",
          icon: <GitBranch className="h-4 w-4" />,
          onClick: onOpenGubim,
          view: "gubimclass",
        },
        {
          id: "camps",
          label: "Diccionari de camps",
          icon: <Settings2 className="h-4 w-4" />,
          onClick: onOpenFields,
          view: "fields",
        },
      ],
    },
    {
      id: "administracio",
      label: "Administració",
      icon: <Shield className="h-4 w-4" />,
      adminOnly: true,
      items: [
        {
          id: "usuaris",
          label: "Gestió d'usuaris",
          icon: <Users className="h-4 w-4" />,
          onClick: onOpenUsers,
          adminOnly: true,
        },
      ],
    },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo + Title */}
      <div
        className="px-4 py-5 flex items-center gap-3 border-b border-white/10"
        style={{ background: "linear-gradient(135deg, #006E7A 0%, #0099A8 100%)" }}
      >
        <div className="h-10 w-10 rounded-full overflow-hidden bg-white/15 flex items-center justify-center shadow-inner shrink-0">
          <img src={logo} alt="CBT" className="h-9 w-9 object-contain rounded-full" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-white/60 uppercase tracking-widest font-medium leading-none">
            Consorci
          </div>
          <div className="text-sm font-bold text-white leading-tight truncate">Besòs · Tordera</div>
          <div className="text-[10px] text-white/60 leading-tight">TaulaMaster</div>
        </div>
        <button
          className="lg:hidden text-white/70 hover:text-white ml-1"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {groups.map((group) => {
          if (group.adminOnly && !isAdmin) return null;
          const isOpen = openGroups[group.id] ?? true;
          const visibleItems = group.items.filter((item) => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.view && !canSeeView(item.view as any)) return false;
            return true;
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.id}>
              {/* Group header */}
              <button
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wider text-[#006E7A] hover:bg-[#0099A8]/8 transition-colors",
                  group.topLevelView && activeSection === group.topLevelView && "bg-[#0099A8]/12"
                )}
                onClick={() => {
                  if (group.topLevelView) {
                    onSectionChange(group.topLevelView);
                    setMobileOpen(false);
                  }
                  toggleGroup(group.id);
                }}
              >
                <span className="text-[#0099A8]">{group.icon}</span>
                <span className="flex-1 text-left">{group.label}</span>
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                )}
              </button>

              {/* Group items */}
              {isOpen && (
                <div className="ml-2 mt-0.5 space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive = activeSection === item.id && !item.onClick;
                    return (
                      <button
                        key={item.id}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all",
                          isActive
                            ? "bg-[#0099A8]/12 text-[#006E7A] font-semibold"
                            : "text-slate-600 hover:bg-slate-100 hover:text-[#006E7A]"
                        )}
                        onClick={() => {
                          if (item.onClick) {
                            item.onClick();
                          } else {
                            onSectionChange(item.id);
                          }
                          setMobileOpen(false);
                        }}
                      >
                        <span
                          className={cn(
                            "shrink-0",
                            isActive ? "text-[#0099A8]" : "text-slate-400"
                          )}
                        >
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                        {item.onClick && (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-300 ml-auto shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
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
                isAdmin
                  ? "bg-violet-100 text-violet-700"
                  : canEdit
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-500"
              )}
            >
              {isAdmin ? "Admin" : canEdit ? "Editor" : "Visualitzador"}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
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
      {/* Mobile toggle button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 h-9 w-9 rounded-md bg-white shadow-md border border-slate-200 flex items-center justify-center text-[#006E7A]"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          "lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white shadow-xl transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent />
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-slate-200 bg-white h-screen sticky top-0">
        <SidebarContent />
      </aside>
    </>
  );
}
