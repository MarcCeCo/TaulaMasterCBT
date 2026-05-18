// src/components/cbt/TaulaMasterMain.tsx — CBT redesign v2
import { lazy, Suspense, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldOff, ChevronRight, Package, GitBranch, Settings2 } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { DashboardHome } from "./DashboardHome";
import { EquipmentsTable } from "./EquipmentsTable";
import { RevitBimPage } from "./RevitBimPage";
import { ProjectesEquipsPage } from "./ProjectesEquipsPage";
import { UserManagerPage } from "@/components/auth/UserManagerPage";
import { ChangePasswordPage } from "@/components/auth/ChangePasswordPage";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const GubimClassManager = lazy(() =>
  import("./GubimClassManager").then((m) => ({ default: m.GubimClassManager }))
);
const FieldsDictionaryDialog = lazy(() =>
  import("./FieldsDictionaryDialog").then((m) => ({ default: m.FieldsDictionaryDialog }))
);

function PageSkeleton() {
  return (
    <div className="space-y-5 p-6">
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      <div className="grid grid-cols-3 gap-3 mt-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-5 border-slate-200 shadow-sm bg-white">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-6 w-14" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const AccessDenied = () => (
  <Card className="p-12 border-slate-100 shadow-sm bg-white flex flex-col items-center gap-4 text-center rounded-2xl">
    <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
      <ShieldOff className="h-6 w-6 text-slate-300" />
    </div>
    <div>
      <p className="font-semibold text-slate-600 text-[14px]">Accés restringit</p>
      <p className="text-[12.5px] text-slate-400 mt-1 leading-relaxed">
        No tens permisos per accedir a aquesta secció.
        <br />Contacta amb l&apos;administrador.
      </p>
    </div>
  </Card>
);

// ─── Tipus de tab del grup Dades ─────────────────────────────────────────────
type DadesTab = "equips" | "gubimclass" | "camps";

interface DadesTabDef {
  id: DadesTab;
  label: string;
  icon: React.ReactNode;
  view: "equips" | "gubimclass" | "fields";
}

// ─── Wrapper de navegació per pestanyes del grup Dades ───────────────────────
function DadesPage({
  initialTab,
  onTabChange,
}: {
  initialTab: DadesTab;
  onTabChange?: (tab: DadesTab) => void;
}) {
  const { canSeeView } = useAuth();
  const [tab, setTabInternal] = useState<DadesTab>(initialTab);

  // Sync si el pare canvia la pestanya (clic a sidebar)
  if (tab !== initialTab) {
    setTabInternal(initialTab);
  }

  const setTab = (t: DadesTab) => {
    setTabInternal(t);
    onTabChange?.(t);
  };

  const tabs: DadesTabDef[] = [
    { id: "equips",     label: "Taula Master",        icon: <Package className="h-4 w-4" />,   view: "equips" },
    { id: "gubimclass", label: "GuBIMClass",           icon: <GitBranch className="h-4 w-4" />, view: "gubimclass" },
    { id: "camps",      label: "Diccionari de camps",  icon: <Settings2 className="h-4 w-4" />, view: "fields" },
  ];

  const visibleTabs = tabs.filter((t) => canSeeView(t.view));

  return (
    <div className="space-y-6">
      {visibleTabs.length > 1 && (
        <div className="flex border-b border-slate-200 gap-1">
          {visibleTabs.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                  isActive
                    ? "border-[#0099A8] text-[#006E7A]"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {tab === "equips" && (
        canSeeView("equips") ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Taula Master</h1>
              <p className="text-sm text-slate-500 mt-1">Llista i gestió de tots els equips tècnics</p>
            </div>
            <Card className="border-slate-100 shadow-sm bg-white overflow-hidden p-0 rounded-2xl">
              <EquipmentsTable />
            </Card>
          </div>
        ) : <AccessDenied />
      )}

      {tab === "gubimclass" && (
        canSeeView("gubimclass")
          ? <Suspense fallback={<PageSkeleton />}><GubimClassManager /></Suspense>
          : <AccessDenied />
      )}

      {tab === "camps" && (
        canSeeView("fields")
          ? <Suspense fallback={<PageSkeleton />}><FieldsDictionaryDialog /></Suspense>
          : <AccessDenied />
      )}
    </div>
  );
}

export function TaulaMasterMain() {
  const { canSeeView, profile, user, isAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState("dashboard");

  const profileLoaded = !!profile || !user;
  const noAccessAtAll =
    profileLoaded &&
    !canSeeView("equips") && !canSeeView("gubimclass") &&
    !canSeeView("fields") && !canSeeView("revit") &&
    !canSeeView("projectes") && !canSeeView("rosmiman");

  const sectionTitles: Record<string, { title: string; sub: string }> = {
    dashboard:          { title: "Resum general",        sub: "Visió global de l'estat de la Taula Master" },
    equips:             { title: "Taula Master",          sub: "Llista i gestió de tots els equips tècnics" },
    gubimclass:         { title: "GuBIMClass",            sub: "Classificació tècnica d'actius" },
    camps:              { title: "Diccionari de camps",   sub: "Definició i gestió de camps de dades" },
    "revit-bim":        { title: "Documentació BIM",      sub: "Portal de recursos i famílies Revit" },
    "projectes-equips": { title: "Llistat de projectes", sub: "Equips assignats per projecte" },
    rosmiman:           { title: "TAGs Rosmiman",         sub: "Integració amb el sistema Rosmiman" },
    usuaris:            { title: "Gestió d'usuaris",      sub: "Administració de comptes i permisos" },
    canviapwd:          { title: "Canvia contrasenya",    sub: "Actualitza les teves credencials d'accés" },
  };

  const currentMeta = sectionTitles[activeSection] ?? { title: "TaulaMaster", sub: "" };

  const dadesGroup: DadesTab[] = ["equips", "gubimclass", "camps"];
  const isDades = dadesGroup.includes(activeSection as DadesTab);

  const renderContent = () => {
    if (noAccessAtAll) {
      return (
        <Card className="p-12 border-slate-100 shadow-sm bg-white flex flex-col items-center gap-4 text-center rounded-2xl">
          <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
            <ShieldOff className="h-6 w-6 text-slate-300" />
          </div>
          <div>
            <p className="font-semibold text-slate-600 text-[14px]">Sense accés assignat</p>
            <p className="text-[12.5px] text-slate-400 mt-1 leading-relaxed">
              No tens permisos per veure cap secció d&apos;aquesta aplicació.
              <br />Contacta amb l&apos;administrador.
            </p>
          </div>
        </Card>
      );
    }

    switch (activeSection) {
      case "dashboard": return <DashboardHome />;

      case "equips":
      case "gubimclass":
      case "camps":
        return (
          <DadesPage
            initialTab={activeSection as DadesTab}
            onTabChange={(tab) => setActiveSection(tab)}
          />
        );

      case "revit-bim":
        if (!canSeeView("revit")) return <AccessDenied />;
        return <RevitBimPage />;

      case "projectes-equips":
        if (!canSeeView("projectes") && !canSeeView("rosmiman")) return <AccessDenied />;
        return (
          <ProjectesEquipsPage
            initialTab="projectes"
            onTabChange={(tab) => setActiveSection(tab === "rosmiman" ? "rosmiman" : "projectes-equips")}
          />
        );

      case "rosmiman":
        if (!canSeeView("rosmiman")) return <AccessDenied />;
        return (
          <ProjectesEquipsPage
            initialTab="rosmiman"
            onTabChange={(tab) => setActiveSection(tab === "rosmiman" ? "rosmiman" : "projectes-equips")}
          />
        );

      case "usuaris":
        if (!isAdmin) return <AccessDenied />;
        return <UserManagerPage />;

      case "canviapwd":
        return <ChangePasswordPage />;

      default: return <DashboardHome />;
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--sand-100, #F3F4F2)" }}>
      <AppSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      <div className="flex-1 min-w-0 flex flex-col">

        {/* Topbar */}
        <div
          className="h-[54px] shrink-0 flex items-center px-5 lg:px-7 gap-4 sticky top-0 z-30"
          style={{
            background: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderBottom: "1px solid rgba(0,90,99,0.08)",
            boxShadow: "0 1px 0 rgba(0,90,99,0.04)",
          }}
        >
          <div className="w-10 lg:w-0 shrink-0" />

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[11.5px] text-slate-400 font-medium hidden sm:block">CBT</span>
            <ChevronRight className="h-3 w-3 text-slate-300 hidden sm:block shrink-0" />
            {isDades && (
              <>
                <span className="text-[11.5px] text-slate-400 font-medium hidden sm:block">Dades</span>
                <ChevronRight className="h-3 w-3 text-slate-300 hidden sm:block shrink-0" />
              </>
            )}
            <span className="text-[14px] font-bold text-slate-800 leading-tight truncate tracking-tight">
              {currentMeta.title}
            </span>
            {currentMeta.sub && (
              <span className="hidden md:inline text-[12px] text-slate-400 ml-1 truncate">
                — {currentMeta.sub}
              </span>
            )}
          </div>

          <div
            className="hidden sm:flex items-center gap-1.5 text-[10.5px] font-medium px-3 py-1.5 rounded-full shrink-0"
            style={{
              background: "rgba(16,185,129,0.08)",
              color: "#047857",
              border: "1px solid rgba(16,185,129,0.18)",
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Sistema operatiu
          </div>
        </div>

        {/* Contingut */}
        <main className="flex-1 px-4 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          <Suspense fallback={<PageSkeleton />}>{renderContent()}</Suspense>
        </main>

        {/* Footer */}
        <footer
          className="px-6 py-2 flex items-center justify-between"
          style={{ borderTop: "1px solid rgba(0,90,99,0.08)", background: "rgba(255,255,255,0.7)" }}
        >
          <span className="text-[10.5px] text-slate-400">
            Consorci Besòs · Tordera · TaulaMaster
          </span>
          <span className="hidden sm:block text-[10.5px]" style={{ color: "var(--cbt-400)" }}>
            CBT © {new Date().getFullYear()}
          </span>
        </footer>
      </div>
    </div>
  );
}
