// src/components/cbt/TaulaMasterMain.tsx
import { lazy, Suspense, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldOff } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { DashboardHome } from "./DashboardHome";
import { EquipmentsTable } from "./EquipmentsTable";
import { RevitBimPage } from "./RevitBimPage";
import { ProjectesEquipsPage } from "./ProjectesEquipsPage";
import { UserManagerPage } from "@/components/auth/UserManagerPage";
import { ChangePasswordPage } from "@/components/auth/ChangePasswordPage";
import { useAuth } from "@/lib/auth";

// Lazy load de les pàgines pesades
const GubimClassManager = lazy(() =>
  import("./GubimClassManager").then((m) => ({ default: m.GubimClassManager }))
);
const FieldsDictionaryDialog = lazy(() =>
  import("./FieldsDictionaryDialog").then((m) => ({ default: m.FieldsDictionaryDialog }))
);

/* ─ Skeleton de pàgina ─────────────────────────────────────────────────────── */
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

/* ─ Accés denegat ──────────────────────────────────────────────────────────── */
const AccessDenied = () => (
  <Card className="p-12 border-slate-200 shadow-sm bg-white flex flex-col items-center gap-4 text-center">
    <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
      <ShieldOff className="h-6 w-6 text-slate-400" />
    </div>
    <div>
      <p className="font-semibold text-slate-700">Accés restringit</p>
      <p className="text-[13px] text-slate-400 mt-1 leading-relaxed">
        No tens permisos per accedir a aquesta secció.
        <br />Contacta amb l&apos;administrador.
      </p>
    </div>
  </Card>
);

/* ─ Component principal ────────────────────────────────────────────────────── */
export function TaulaMasterMain() {
  const { canSeeView, profile, user, isAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState("dashboard");

  const profileLoaded = !!profile || !user;
  const noAccessAtAll =
    profileLoaded &&
    !canSeeView("equips") &&
    !canSeeView("gubimclass") &&
    !canSeeView("fields") &&
    !canSeeView("revit") &&
    !canSeeView("projectes") &&
    !canSeeView("rosmiman");

  /* ── Títol dinàmic per al topbar ── */
  const sectionTitles: Record<string, { title: string; sub: string }> = {
    dashboard:       { title: "Resum general",        sub: "Visió global de l'estat de la Taula Master" },
    equips:          { title: "Taula Master",          sub: "Llista i gestió de tots els equips tècnics" },
    gubimclass:      { title: "GuBIMClass",            sub: "Classificació tècnica d'actius" },
    camps:           { title: "Diccionari de camps",   sub: "Definició i gestió de camps de dades" },
    "revit-bim":     { title: "Documentació BIM",      sub: "Portal de recursos i famílies Revit" },
    "projectes-equips": { title: "Projectes",          sub: "Equips assignats per projecte" },
    rosmiman:        { title: "TAGs Rosmiman",         sub: "Integració amb el sistema Rosmiman" },
    usuaris:         { title: "Gestió d'usuaris",      sub: "Administració de comptes i permisos" },
    canviapwd:       { title: "Canvia contrasenya",    sub: "Actualitza les teves credencials d'accés" },
  };

  const currentMeta = sectionTitles[activeSection] ?? { title: "TaulaMaster", sub: "" };

  const renderContent = () => {
    if (noAccessAtAll) {
      return (
        <Card className="p-12 border-slate-200 shadow-sm bg-white flex flex-col items-center gap-4 text-center">
          <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
            <ShieldOff className="h-6 w-6 text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-700">Sense accés assignat</p>
            <p className="text-[13px] text-slate-400 mt-1 leading-relaxed">
              No tens permisos per veure cap secció d&apos;aquesta aplicació.
              <br />Contacta amb l&apos;administrador.
            </p>
          </div>
        </Card>
      );
    }

    switch (activeSection) {
      case "dashboard":
        return <DashboardHome />;

      case "equips":
        if (!canSeeView("equips")) return <AccessDenied />;
        return (
          <div className="space-y-4">
            <div>
              <h1 className="text-[20px] font-semibold text-slate-800 tracking-tight">Taula Master</h1>
              <p className="text-[13px] text-slate-400 mt-1">Llista i gestió de tots els equips tècnics</p>
            </div>
            <Card className="border-slate-200 shadow-sm bg-white overflow-hidden p-0">
              <EquipmentsTable />
            </Card>
          </div>
        );

      case "gubimclass":
        if (!canSeeView("gubimclass")) return <AccessDenied />;
        return (
          <Suspense fallback={<PageSkeleton />}>
            <GubimClassManager />
          </Suspense>
        );

      case "camps":
        if (!canSeeView("fields")) return <AccessDenied />;
        return (
          <Suspense fallback={<PageSkeleton />}>
            <FieldsDictionaryDialog />
          </Suspense>
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

      default:
        return <DashboardHome />;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--sand-100,#F3F4F2)] flex">
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar (títol de secció + breadcrumb visual) */}
        <div className="h-[52px] shrink-0 bg-white border-b border-slate-200 flex items-center px-6 gap-3">
          {/* Espaiat per al botó hamburguesa en mòbil */}
          <div className="w-10 lg:w-0 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[14.5px] font-semibold text-slate-800 leading-tight">
              {currentMeta.title}
            </span>
            {currentMeta.sub && (
              <span className="hidden sm:inline text-[12.5px] text-slate-400 ml-2">
                — {currentMeta.sub}
              </span>
            )}
          </div>
          {/* Dot indicador sistema */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Sistema operatiu
          </div>
        </div>

        {/* Contingut principal */}
        <main className="flex-1 px-4 lg:px-8 py-6 max-w-[1400px] w-full mx-auto">
          <Suspense fallback={<PageSkeleton />}>{renderContent()}</Suspense>
        </main>

        {/* Peu de pàgina */}
        <footer className="px-6 py-2.5 border-t border-slate-200 bg-white flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Consorci Besòs · Tordera · TaulaMaster
          </span>
          <span className="hidden sm:block text-[11px] text-slate-400">
            CBT © {new Date().getFullYear()}
          </span>
        </footer>
      </div>
    </div>
  );
}
