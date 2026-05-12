// src/components/cbt/ProjectesEquipsPage.tsx
import { Card } from "@/components/ui/card";
import { FolderOpen } from "lucide-react";

export function ProjectesEquipsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Llistat d'equips</h1>
        <p className="text-sm text-slate-500 mt-1">
          Equips associats als projectes
        </p>
      </div>
      <Card className="p-10 border-0 shadow-sm bg-white flex flex-col items-center gap-4 text-center">
        <div className="h-14 w-14 rounded-full bg-[#0099A8]/10 flex items-center justify-center">
          <FolderOpen className="h-7 w-7 text-[#0099A8]" />
        </div>
        <div>
          <p className="font-semibold text-slate-700">Llistat d'equips de projectes</p>
          <p className="text-sm text-muted-foreground mt-1">
            Aquesta secció mostrarà els equips vinculats als projectes.
          </p>
        </div>
      </Card>
    </div>
  );
}
