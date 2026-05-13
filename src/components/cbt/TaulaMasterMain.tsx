// src/components/cbt/TaulaMasterMain.tsx
import { lazy, Suspense, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "./AppSidebar";
import { DashboardHome } from "./DashboardHome";
import { EquipmentsTable } from "./EquipmentsTable";
import { RevitExportPage } from "./RevitExportPage";
import { UserManagerPage } from "@/components/auth/UserManagerPage";
import { ChangePasswordPage } from "@/components/auth/ChangePasswordPage";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/lib/auth";

// Lazy load dels diàlegs pesats (GuBIMClass i Camps segueixen com a diàlegs)
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

export function TaulaMasterMain() {
  const { canSeeView, profile, user, isAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [gubim, setGubim] = useState(false);
  const [dict, setDict] = useState(false);

  const profileLoaded = !!profile || !user;
  const noAccessAtAll =
    profileLoaded &&
    !canSeeView("equips") &&
    !canSeeView("gubimclass") &&
    !canSeeView("fields");

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
              <br />
              Contacta amb l&apos;administrador.
            </p>
          </div>
        </Card>
      );
    }

    switch (activeSection) {
      case "dashboard":
        return (
          <DashboardHome
            onGoEquips={() => setActiveSection("equips")}
            onOpenGubim={() => setGubim(true)}
            onOpenFields={() => setDict(true)}
          />
        );

      case "usuaris":
        if (!isAdmin) return null;
        return <UserManagerPage />;

      case "canviapwd":
        return <ChangePasswordPage />;

      case "revit":
        return <RevitExportPage />;

      case "equips":
      default:
        return (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Taula Master</h1>
              <p className="text-sm text-slate-500 mt-1">
                Llista i gestió de tots els equips tècnics
              </p>
            </div>
            <Card className="p-4 border-0 shadow-sm bg-white">
              <EquipmentsTable />
            </Card>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex">
      {/* Sidebar */}
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onOpenGubim={() => setGubim(true)}
        onOpenFields={() => setDict(true)}
        onGoHome={() => setActiveSection("dashboard")}
      />

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Spacer for mobile toggle button */}
        <div className="h-14 lg:h-0 shrink-0" />

        <main className="flex-1 px-4 lg:px-8 py-6 max-w-[1400px] w-full mx-auto">
          <Suspense fallback={<PageSkeleton />}>{renderContent()}</Suspense>
        </main>

        {/* Footer */}
        <footer className="px-8 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-[10px] text-slate-400">
          <span>Consorci Besòs · Tordera · TaulaMaster</span>
          <span className="hidden sm:block">CBT © {new Date().getFullYear()}</span>
        </footer>
      </div>

      {/* GuBIMClass i Camps segueixen com a diàlegs flotants */}
      <Suspense fallback={null}>
        <GubimClassManager open={gubim} onOpenChange={setGubim} />
        <FieldsDictionaryDialog open={dict} onOpenChange={setDict} />
      </Suspense>
    </div>
  );
}
