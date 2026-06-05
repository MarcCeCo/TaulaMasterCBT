// src/components/cbt/TaulaMasterMain.tsx — CBT redesign v2
import { lazy, Suspense, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldOff, GitBranch, Settings2 } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { DashboardHome } from "./DashboardHome";
import { GroqChatWidget } from "./GroqChatWidget";
import { useAuth } from "@/lib/auth";

// Pàgines pesants carregades lazy — cada una tindrà el seu propi chunk JS
const EquipmentsTable = lazy(() =>
  import("./EquipmentsTable").then((m) => ({ default: m.EquipmentsTable }))
);
const RevitBimPage = lazy(() =>
  import("./RevitBimPage").then((m) => ({ default: m.RevitBimPage }))
);
const Visualitzador3DPage = lazy(() =>
  import("./Visualitzador3DPage").then((m) => ({ default: m.Visualitzador3DPage }))
);
const ProjectesEquipsPage = lazy(() =>
  import("./ProjectesEquipsPage").then((m) => ({ default: m.ProjectesEquipsPage }))
);
const UserManagerPage = lazy(() =>
  import("@/components/auth/UserManagerPage").then((m) => ({ default: m.UserManagerPage }))
);
const ChangePasswordPage = lazy(() =>
  import("@/components/auth/ChangePasswordPage").then((m) => ({ default: m.ChangePasswordPage }))
);
const ControlAgentsPage = lazy(() =>
  import("./ControlAgentsPage").then((m) => ({ default: m.ControlAgentsPage }))
);
const GubimClassManager = lazy(() =>
  import("./GubimClassManager").then((m) => ({ default: m.GubimClassManager }))
);
const FieldsDictionaryDialog = lazy(() =>
  import("./FieldsDictionaryDialog").then((m) => ({ default: m.FieldsDictionaryDialog }))
);

function PageSkeleton() {
  return (
    <div className="space-y-6">
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

// ─── Pàgina Taula Master amb botons per obrir pop-ups ────────────────────────
function TaulaMasterPage() {
  const { canSeeView } = useAuth();
  const [gubimOpen, setGubimOpen] = useState(false);
  const [campsOpen, setCampsOpen] = useState(false);

  if (!canSeeView("equips")) return <AccessDenied />;

  return (
    <div className="space-y-6">
      {/* Capçalera amb botons d'accés ràpid */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Taula Master</h1>
          <p className="text-sm text-slate-500 mt-1">Llista i gestió de tots els equips tècnics</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canSeeView("gubimclass") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-slate-200 text-slate-600 hover:text-[#006E7A] hover:border-[#0099A8]/40"
              onClick={() => setGubimOpen(true)}
            >
              <GitBranch className="h-3.5 w-3.5" />
              GuBIMClass
            </Button>
          )}
          {canSeeView("fields") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-slate-200 text-slate-600 hover:text-[#006E7A] hover:border-[#0099A8]/40"
              onClick={() => setCampsOpen(true)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Diccionari de camps
            </Button>
          )}
        </div>
      </div>

      {/* Taula principal */}
      <Card className="border-slate-100 shadow-sm bg-white overflow-hidden p-0 rounded-2xl">
        <EquipmentsTable />
      </Card>

      {/* Pop-up GuBIMClass */}
      <Dialog open={gubimOpen} onOpenChange={setGubimOpen}>
        <DialogContent className="max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>GuBIMClass</DialogTitle>
          </DialogHeader>
          <div className="pt-6">
            <Suspense fallback={<PageSkeleton />}>
              <GubimClassManager />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pop-up Diccionari de camps */}
      <Dialog open={campsOpen} onOpenChange={setCampsOpen}>
        <DialogContent className="max-w-[95vw] xl:max-w-[1300px] w-full flex flex-col p-0 gap-0 overflow-hidden max-h-[90vh]">
          <DialogHeader className="sr-only">
            <DialogTitle>Diccionari de camps</DialogTitle>
          </DialogHeader>
          <div className="p-6 pt-8 flex flex-col gap-4 overflow-hidden flex-1 min-h-0">
            <Suspense fallback={<PageSkeleton />}>
              <FieldsDictionaryDialog />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TaulaMasterMain() {
  const { canSeeView, profile, user, isAdmin, loading: authLoading } = useAuth();

  const VALID_SECTIONS = [
    "dashboard","equips","revit-bim","visualitzador-3d",
    "projectes-equips","rosmiman","usuaris","control-agents","canviapwd",
  ];

  const [activeSection, setActiveSectionState] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem("cbt_active_section");
      return saved && VALID_SECTIONS.includes(saved) ? saved : "dashboard";
    } catch {
      return "dashboard";
    }
  });

  const setActiveSection = (section: string) => {
    try { sessionStorage.setItem("cbt_active_section", section); } catch {}
    setActiveSectionState(section);
  };

  // Mentre l'autenticació s'està resolent, mostrem el skeleton pur
  // sense renderitzar cap contingut — evita el flash del dashboard
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--sand-100, #F3F4F2)" }}>
        <PageSkeleton />
      </div>
    );
  }

  const profileLoaded = !!profile || !user;
  const noAccessAtAll =
    profileLoaded &&
    !canSeeView("equips") && !canSeeView("gubimclass") &&
    !canSeeView("fields") && !canSeeView("revit") &&
    !canSeeView("projectes") && !canSeeView("rosmiman") &&
    !canSeeView("visor3d");

  const sectionTitles: Record<string, { title: string; sub: string }> = {
    dashboard:          { title: "Resum general",        sub: "Visió global de l'estat de la Taula Master" },
    equips:             { title: "Taula Master",          sub: "Llista i gestió de tots els equips tècnics" },
    "revit-bim":        { title: "Documentació BIM",      sub: "Portal de recursos i famílies Revit" },
    "visualitzador-3d": { title: "Visualitzador 3D",       sub: "Models BIM de les instal·lacions" },
    "projectes-equips": { title: "Llistat de projectes", sub: "Equips assignats per projecte" },
    rosmiman:           { title: "TAGs Rosmiman",         sub: "Integració amb el sistema Rosmiman" },
    usuaris:            { title: "Gestió d'usuaris",      sub: "Administració de comptes i permisos" },
    "control-agents":   { title: "Control d'agents",      sub: "Estat i gestió de la sincronització amb Autodesk" },
    canviapwd:          { title: "Canvia contrasenya",    sub: "Actualitza les teves credencials d'accés" },
  };



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
        return <TaulaMasterPage />;

      case "revit-bim":
        if (!canSeeView("revit")) return <AccessDenied />;
        return <RevitBimPage />;

      case "visualitzador-3d":
        if (!canSeeView("visor3d")) return <AccessDenied />;
        return <Visualitzador3DPage />;

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

      case "control-agents":
        if (!isAdmin) return <AccessDenied />;
        return <ControlAgentsPage />;

      case "canviapwd":
        return <ChangePasswordPage />;

      default: return <DashboardHome />;
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "var(--sand-100, #F3F4F2)" }}>
      <AppSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      <div className="flex-1 min-w-0 flex flex-col">

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

      {/* Assistent de suport (botó flotant + xat Groq) */}
      <GroqChatWidget
        pageContext={activeSection}
        pageLabel={sectionTitles[activeSection]?.title}
        isAdmin={isAdmin}
        sectionPermisos={profile?.section_permissions ?? undefined}
      />
    </div>
  );
}
