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

function PageSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-3 gap-4 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-5 border-0 shadow-sm bg-white">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-14" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const AccessDenied = () => (
  <Card className="p-12 border-0 shadow-sm bg-white flex flex-col items-center gap-4 text-center">
    <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
      <ShieldOff className="h-7 w-7 text-slate-400" />
    </div>
    <div>
      <p className="font-semibold text-slate-700">Accés restringit</p>
      <p className="text-sm text-muted-foreground mt-1">
        No tens permisos per accedir a aquesta secció.
        <br />Contacta amb l&apos;administrador.
      </p>
    </div>
  </Card>
);

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

  const renderContent = () => {
    if (noAccessAtAll) {
      return (
        <Card className="p-12 border-0 shadow-sm bg-white flex flex-col items-center gap-4 text-center">
          <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center">
            <ShieldOff className="h-7 w-7 text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-700">Sense accés assignat</p>
            <p className="text-sm text-muted-foreground mt-1">
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
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Taula Master</h1>
              <p className="text-sm text-slate-500 mt-1">Llista i gestió de tots els equips tècnics</p>
            </div>
            <Card className="p-4 border-0 shadow-sm bg-white">
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
        return <ProjectesEquipsPage />;

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
    <div className="min-h-screen bg-[#F4F6F8] flex">
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Spacer for mobile toggle button */}
        <div className="h-14 lg:h-0 shrink-0" />

        <main className="flex-1 px-4 lg:px-8 py-6 max-w-[1400px] w-full mx-auto">
          <Suspense fallback={<PageSkeleton />}>{renderContent()}</Suspense>
        </main>

        <footer className="px-8 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-[10px] text-slate-400">
          <span>Consorci Besòs · Tordera · TaulaMaster</span>
          <span className="hidden sm:block">CBT © {new Date().getFullYear()}</span>
        </footer>
      </div>
    </div>
  );
}
