// src/components/cbt/ImportTagsDialog.tsx
// Importació de TAGs des d'un Excel/CSV: detecta automàticament la fila de
// capçalera i les columnes (denominació, línia...), proposa codi d'equip,
// funció i duplicitat, i deixa revisar-ho abans de crear res.

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Equipment } from "@/hooks/useEquipments";
import type { ProjectTag, Projecte } from "@/lib/useProjectes";
import { readWorkbook } from "@/lib/tagImport/readWorkbook";
import {
  buildSourceRows,
  detectColumns,
  detectHeaderRow,
} from "@/lib/tagImport/detectColumns";
import {
  buildTag,
  evaluateRows,
  nextFreeFunction,
  proposeRows,
} from "@/lib/tagImport/proposeTags";
import type {
  ColumnRole,
  ProposedRow,
  RowStatus,
  SheetData,
} from "@/lib/tagImport/types";

type AddTag = (
  projecteId: string,
  tag: Omit<ProjectTag, "id" | "projecteId" | "createdAt">,
) => Promise<void>;

interface ImportTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projecte: Projecte;
  equipments: Equipment[];
  rosmimanTags: string[];
  addTag: AddTag;
}

type Step = "fitxer" | "columnes" | "revisio";
type Filtre = "tots" | "revisar" | "problemes" | "no-tag";

const ROLE_LABEL: Record<ColumnRole, string> = {
  denominacio: "Denominació de l'equip",
  linia: "Línia",
  potencia: "Potència",
  tensio: "Tensió",
  ignorar: "Ignorar",
};

const STATUS_LABEL: Record<RowStatus, string> = {
  ok: "Correcte",
  "no-aplica": "Sense tag",
  "sense-codi": "Falta codi",
  "sense-equip-master": "Codi fora Taula Master",
  invalid: "Dades invàlides",
  "existeix-projecte": "Ja és al projecte",
  "existeix-rosmiman": "Ja és a Rosmiman",
  "duplicat-importacio": "Duplicat a la importació",
};

const selectClass =
  "h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#0099A8]";

function StatusBadge({ status }: { status: RowStatus }) {
  const tone =
    status === "ok"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "no-aplica"
        ? "bg-slate-100 text-slate-500 border-slate-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", tone)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function ConfBadge({ value }: { value: ProposedRow["confianca"] }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const tone =
    value === "alta"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : value === "mitjana"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  const label =
    value === "alta" ? "Alta" : value === "mitjana" ? "Mitjana" : "Revisar";
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", tone)}>
      {label}
    </Badge>
  );
}

export function ImportTagsDialog({
  open,
  onOpenChange,
  projecte,
  equipments,
  rosmimanTags,
  addTag,
}: ImportTagsDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("fitxer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [scores, setScores] = useState<number[]>([]);

  const installacions = useMemo(() => {
    const llista = projecte.codisInstallacio?.length
      ? projecte.codisInstallacio.map((i) => i.codi)
      : projecte.codiInstallacio
        ? [projecte.codiInstallacio]
        : [];
    return llista.filter((c) => c);
  }, [projecte]);
  const [inst, setInst] = useState(installacions[0] ?? "");
  const [ccm, setCcm] = useState("");
  const [agrupa, setAgrupa] = useState(true);
  const [rows, setRows] = useState<ProposedRow[]>([]);
  const [filtre, setFiltre] = useState<Filtre>("tots");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const sheet = sheets[sheetIdx];

  // codi d'equip → equip de la Taula Master
  const equipByCode = useMemo(() => {
    const m = new Map<string, Equipment>();
    for (const e of equipments) {
      const c = e.equipCode?.trim().toUpperCase();
      if (c && !m.has(c)) m.set(c, e);
    }
    return m;
  }, [equipments]);
  const masterCodes = useMemo(
    () => [...equipByCode.keys()].sort(),
    [equipByCode],
  );

  const projectTags = useMemo(
    () => new Set(projecte.tags.map((t) => t.tagComplet.toUpperCase())),
    [projecte.tags],
  );
  const rosmimanSet = useMemo(
    () => new Set(rosmimanTags.map((t) => t.trim().toUpperCase())),
    [rosmimanTags],
  );
  const existingTags = useMemo(
    () => [...projectTags, ...rosmimanSet],
    [projectTags, rosmimanSet],
  );

  const evaluation = useMemo(
    () =>
      evaluateRows(rows, {
        codiInstallacio: inst,
        projectTags,
        rosmimanTags: rosmimanSet,
        masterCodes: new Set(masterCodes),
      }),
    [rows, inst, projectTags, rosmimanSet, masterCodes],
  );

  function reset() {
    setStep("fitxer");
    setError(null);
    setFileName("");
    setSheets([]);
    setSheetIdx(0);
    setRows([]);
    setFiltre("tots");
    setProgress(0);
    setCcm("");
    setInst(installacions[0] ?? "");
    if (fileRef.current) fileRef.current.value = "";
  }

  function applyLayout(data: SheetData, header?: number) {
    const h = header ?? detectHeaderRow(data.grid);
    const layout = detectColumns(data.grid, h);
    setHeaderRow(h);
    setRoles(layout.columns.map((c) => c.role));
    setScores(layout.columns.map((c) => c.score));
  }

  async function onFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const data = await readWorkbook(file);
      if (data.length === 0) {
        setError("El fitxer no conté dades.");
        return;
      }
      setSheets(data);
      setSheetIdx(0);
      setFileName(file.name);
      applyLayout(data[0]);
      setStep("columnes");
    } catch {
      setError(
        "No s'ha pogut llegir el fitxer. Comprova que sigui un Excel o CSV vàlid.",
      );
    } finally {
      setLoading(false);
    }
  }

  function changeSheet(i: number) {
    setSheetIdx(i);
    applyLayout(sheets[i]);
  }

  function changeRole(col: number, role: ColumnRole) {
    setRoles((prev) =>
      prev.map((r, i) => {
        if (i === col) return role;
        // Un rol (excepte "ignorar") només pot estar en una columna
        return role !== "ignorar" && r === role ? "ignorar" : r;
      }),
    );
    setScores((prev) => prev.map((s, i) => (i === col ? 1 : s)));
  }

  function compute(nextCcm = ccm, nextInst = inst, nextAgrupa = agrupa) {
    if (!sheet) return;
    const src = buildSourceRows(sheet.grid, headerRow, roles);
    setRows(
      proposeRows(src, {
        codiInstallacio: nextInst,
        ccm: nextCcm,
        existingTags,
        agrupaBessones: nextAgrupa,
      }),
    );
  }

  function goReview() {
    if (!roles.includes("denominacio")) {
      setError("Indica quina columna conté la denominació de l'equip.");
      return;
    }
    if (!/^\d$/.test(ccm)) {
      setError("Indica el dígit del CCM (0-9) abans de continuar.");
      return;
    }
    if (!/^[A-Z0-9]{5}$/i.test(inst)) {
      setError("El projecte necessita un codi d'instal·lació de 5 caràcters.");
      return;
    }
    setError(null);
    compute();
    setStep("revisio");
  }

  function updateRow(id: string, patch: Partial<ProposedRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function changeCode(row: ProposedRow, code: string) {
    if (!code) {
      updateRow(row.id, { codiEquip: "", include: false });
      return;
    }
    const others = rows
      .filter((r) => r.id !== row.id && r.kind === "equip" && r.codiEquip)
      .map((r) => evaluation.get(r.id)?.tag ?? "")
      .filter((t) => t);
    const n = nextFreeFunction(
      [...existingTags, ...others],
      inst,
      code,
      row.ccm,
    );
    updateRow(row.id, {
      kind: "equip",
      codiEquip: code,
      confianca: null,
      funcio: n <= 99 ? String(n).padStart(2, "0") : "",
      duplicitat: "A",
      include: true,
    });
  }

  const eligible = rows.filter(
    (r) => r.include && evaluation.get(r.id)?.status === "ok",
  );
  const counts = useMemo(() => {
    let equips = 0;
    let noTag = 0;
    let problemes = 0;
    let revisar = 0;
    for (const r of rows) {
      const st = evaluation.get(r.id)?.status;
      if (r.kind === "no-tag") noTag++;
      else equips++;
      if (r.kind !== "no-tag" && st !== "ok") problemes++;
      if (r.confianca === "revisar" || r.confianca === "mitjana") revisar++;
    }
    return { equips, noTag, problemes, revisar };
  }, [rows, evaluation]);

  const visibleRows = rows.filter((r) => {
    const st = evaluation.get(r.id)?.status;
    if (filtre === "revisar")
      return r.confianca === "revisar" || r.confianca === "mitjana";
    if (filtre === "problemes") return r.kind !== "no-tag" && st !== "ok";
    if (filtre === "no-tag") return r.kind === "no-tag";
    return true;
  });

  async function exportRevisio() {
    const mod = await import("xlsx");
    const XLSX = mod.default ?? mod;
    const data = rows.map((r) => {
      const ev = evaluation.get(r.id);
      return {
        Línia: r.linia,
        Denominació: r.denominacio,
        Tensió: r.tensio,
        Potència: r.potencia,
        "Codi equip": r.codiEquip,
        CCM: r.ccm,
        Funció: r.funcio,
        Duplicitat: r.duplicitat,
        TAG: ev?.tag ?? "",
        Estat: ev ? STATUS_LABEL[ev.status] : "",
        Confiança: r.confianca ?? "",
        Observacions: [r.nota, ev?.message].filter(Boolean).join(" "),
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tags");
    XLSX.writeFile(
      wb,
      `revisio_tags_${projecte.codiProjecte || "projecte"}.xlsx`,
    );
  }

  async function importar() {
    setImporting(true);
    setProgress(0);
    let done = 0;
    try {
      for (const r of eligible) {
        const ev = evaluation.get(r.id);
        const equip = equipByCode.get(r.codiEquip.toUpperCase());
        if (!ev || !equip) continue;
        await addTag(projecte.id, {
          equipId: equip.id,
          codiInstallacio: inst.toUpperCase(),
          ccm: r.ccm,
          funcio: r.funcio.padStart(2, "0"),
          duplicitat: r.duplicitat.toUpperCase(),
          tagComplet: buildTag(
            inst,
            r.codiEquip,
            r.ccm,
            r.funcio,
            r.duplicitat,
          ),
          status: "pendent",
          comentari: r.linia ? `Línia ${r.linia}` : "",
          descripcioEquip: r.denominacio.toUpperCase(),
          fieldValues: {},
        });
        done++;
        setProgress(done);
      }
      toast.success(
        `${done} tag${done !== 1 ? "s" : ""} creat${done !== 1 ? "s" : ""}`,
      );
      onOpenChange(false);
      reset();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconegut";
      toast.error(
        `S'ha aturat la importació després de ${done} tag${done !== 1 ? "s" : ""}: ${msg}`,
      );
    } finally {
      setImporting(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const grid = sheet?.grid ?? [];
  const width = roles.length;
  const preview = grid.slice(headerRow, headerRow + 8);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (importing) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-[95vw] xl:max-w-[1300px] w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#006E7A]">
            <FileSpreadsheet className="h-5 w-5" /> Importar TAGs des d'Excel
          </DialogTitle>
          <DialogDescription>
            Pas {step === "fitxer" ? 1 : step === "columnes" ? 2 : 3} de 3 ·
            Projecte {projecte.codiProjecte} {projecte.nom}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {step === "fitxer" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Puja un Excel (.xlsx, .xls) o CSV amb el llistat d'equips. No cal
              que tingui unes columnes concretes: la plataforma detectarà quina
              és la de la denominació i et deixarà corregir-ho.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <Button
              className="gap-2 bg-[#0099A8] hover:bg-[#006E7A] text-white"
              disabled={loading}
              onClick={() => fileRef.current?.click()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Selecciona un fitxer
            </Button>
            <p className="text-xs text-slate-500">
              Els tags no es creen fins que els revisis i confirmis al pas 3.
              Atenció: la Preview de Vercel escriu a la base de dades real.
            </p>
          </div>
        )}

        {step === "columnes" && sheet && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="text-sm text-slate-600">
                Fitxer: <b>{fileName}</b>
              </div>
              {sheets.length > 1 && (
                <div className="w-48">
                  <Label className="text-xs">Full</Label>
                  <select
                    className={selectClass}
                    value={sheetIdx}
                    onChange={(e) => changeSheet(Number(e.target.value))}
                  >
                    {sheets.map((s, i) => (
                      <option key={s.name} value={i}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="w-40">
                <Label className="text-xs">Fila de capçalera</Label>
                <Input
                  type="number"
                  min={1}
                  max={grid.length}
                  className="h-8"
                  value={headerRow + 1}
                  onChange={(e) => {
                    const v = Math.max(1, Number(e.target.value) || 1) - 1;
                    applyLayout(sheet, v);
                  }}
                />
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Hem detectat automàticament les columnes. Revisa-ho i corregeix el
              que calgui.
            </p>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    {Array.from({ length: width }, (_, c) => (
                      <th
                        key={c}
                        className="min-w-[150px] p-2 text-left align-top"
                      >
                        <select
                          className={cn(
                            selectClass,
                            roles[c] === "denominacio" &&
                              "border-[#0099A8] bg-[#0099A8]/10 font-semibold",
                          )}
                          value={roles[c]}
                          onChange={(e) =>
                            changeRole(c, e.target.value as ColumnRole)
                          }
                        >
                          {(Object.keys(ROLE_LABEL) as ColumnRole[]).map(
                            (r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ),
                          )}
                        </select>
                        {roles[c] !== "ignorar" && (
                          <span className="mt-1 block text-[10px] font-normal text-slate-400">
                            Seguretat {Math.round((scores[c] ?? 0) * 100)}%
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr
                      key={i}
                      className={
                        i === 0 ? "bg-slate-100 font-semibold" : "border-t"
                      }
                    >
                      {Array.from({ length: width }, (_, c) => (
                        <td
                          key={c}
                          className="max-w-[260px] truncate p-2"
                          title={r[c]}
                        >
                          {r[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Codi d'instal·lació</Label>
                {installacions.length > 1 ? (
                  <select
                    className={selectClass}
                    value={inst}
                    onChange={(e) => setInst(e.target.value)}
                  >
                    {installacions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input className="h-8" readOnly value={inst} />
                )}
              </div>
              <div>
                <Label className="text-xs">Dígit CCM (0-9)</Label>
                <Input
                  className="h-8"
                  maxLength={1}
                  value={ccm}
                  placeholder="p. ex. 6"
                  onChange={(e) => setCcm(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <label className="flex items-end gap-2 pb-1 text-xs text-slate-600">
                <Checkbox
                  checked={agrupa}
                  onCheckedChange={(v) => setAgrupa(v === true)}
                />
                Unitats iguals o de reserva amb la mateixa funció (lletres A,
                B...)
              </label>
            </div>
          </div>
        )}

        {step === "revisio" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{counts.equips} equips</Badge>
              <Badge variant="outline">{counts.noTag} línies sense tag</Badge>
              <Badge
                variant="outline"
                className="border-amber-200 text-amber-700"
              >
                {counts.revisar} per revisar
              </Badge>
              {counts.problemes > 0 && (
                <Badge
                  variant="outline"
                  className="border-red-200 text-red-700"
                >
                  {counts.problemes} amb problemes
                </Badge>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <select
                  className={cn(selectClass, "w-44")}
                  value={filtre}
                  onChange={(e) => setFiltre(e.target.value as Filtre)}
                >
                  <option value="tots">Mostra-ho tot</option>
                  <option value="revisar">Només per revisar</option>
                  <option value="problemes">Només amb problemes</option>
                  <option value="no-tag">Només sense tag</option>
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRows((prev) =>
                      prev.map((r) => ({
                        ...r,
                        include:
                          r.kind === "equip" &&
                          r.confianca === "alta" &&
                          evaluation.get(r.id)?.status === "ok",
                      })),
                    )
                  }
                >
                  Només confiança alta
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRows((prev) =>
                      prev.map((r) => ({
                        ...r,
                        include: evaluation.get(r.id)?.status === "ok",
                      })),
                    )
                  }
                >
                  Selecciona tot el vàlid
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => void exportRevisio()}
                >
                  <Download className="h-3.5 w-3.5" /> Exporta revisió
                </Button>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-left">
                  <tr>
                    <th className="p-2 w-8"></th>
                    <th className="p-2">Línia</th>
                    <th className="p-2 min-w-[240px]">Denominació</th>
                    <th className="p-2 min-w-[150px]">Codi equip</th>
                    <th className="p-2 w-14">CCM</th>
                    <th className="p-2 w-16">Funció</th>
                    <th className="p-2 w-16">Dup.</th>
                    <th className="p-2 min-w-[170px]">TAG</th>
                    <th className="p-2">Estat</th>
                    <th className="p-2">Confiança</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const ev = evaluation.get(r.id);
                    const status = ev?.status ?? "sense-codi";
                    const suggested = [r.codiEquip, ...r.alternatives].filter(
                      (c, i, a) => c && a.indexOf(c) === i,
                    );
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "border-t align-top",
                          r.kind === "no-tag" &&
                            "bg-slate-50/60 text-slate-500",
                        )}
                        title={[r.nota, ev?.message].filter(Boolean).join(" ")}
                      >
                        <td className="p-2">
                          <Checkbox
                            checked={r.include && status === "ok"}
                            disabled={status !== "ok"}
                            onCheckedChange={(v) =>
                              updateRow(r.id, { include: v === true })
                            }
                          />
                        </td>
                        <td className="p-2 whitespace-nowrap">{r.linia}</td>
                        <td className="p-2">
                          {r.denominacio}
                          {r.nota && (
                            <span className="mt-0.5 block text-[10px] text-slate-400">
                              {r.nota}
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          <select
                            className={selectClass}
                            value={r.codiEquip}
                            onChange={(e) => changeCode(r, e.target.value)}
                          >
                            <option value="">
                              {r.kind === "no-tag"
                                ? "— sense tag —"
                                : "— tria —"}
                            </option>
                            {suggested.length > 0 && (
                              <optgroup label="Suggerits">
                                {suggested.map((c) => (
                                  <option key={`s-${c}`} value={c}>
                                    {c}
                                    {equipByCode.has(c)
                                      ? ` · ${equipByCode.get(c)!.tableName || equipByCode.get(c)!.equipName}`
                                      : " · (no és a la Taula Master)"}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="Tots els codis">
                              {masterCodes.map((c) => (
                                <option key={c} value={c}>
                                  {c} ·{" "}
                                  {equipByCode.get(c)!.tableName ||
                                    equipByCode.get(c)!.equipName}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-8 px-2 text-xs"
                            maxLength={1}
                            value={r.ccm}
                            disabled={r.kind !== "equip"}
                            onChange={(e) =>
                              updateRow(r.id, {
                                ccm: e.target.value.replace(/\D/g, ""),
                              })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-8 px-2 text-xs"
                            maxLength={2}
                            value={r.funcio}
                            disabled={r.kind !== "equip"}
                            onChange={(e) =>
                              updateRow(r.id, {
                                funcio: e.target.value.replace(/\D/g, ""),
                              })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-8 px-2 text-xs uppercase"
                            maxLength={1}
                            value={r.duplicitat}
                            disabled={r.kind !== "equip"}
                            onChange={(e) =>
                              updateRow(r.id, {
                                duplicitat: e.target.value
                                  .replace(/[^a-z]/gi, "")
                                  .toUpperCase(),
                              })
                            }
                          />
                        </td>
                        <td className="p-2 font-mono">{ev?.tag}</td>
                        <td className="p-2">
                          <StatusBadge status={status} />
                        </td>
                        <td className="p-2">
                          <ConfBadge value={r.confianca} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">
              La numeració proposada és provisional: no segueix el sentit del
              fluid. Revisa-la amb el P&ID abans de validar els tags. Els tags
              es creen com a «pendent» i la línia es desa als comentaris.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step !== "fitxer" && (
            <Button
              variant="outline"
              disabled={importing}
              onClick={() => {
                setError(null);
                setStep(step === "revisio" ? "columnes" : "fitxer");
              }}
            >
              Enrere
            </Button>
          )}
          {step === "columnes" && (
            <Button
              className="bg-[#0099A8] hover:bg-[#006E7A] text-white"
              onClick={goReview}
            >
              Continua
            </Button>
          )}
          {step === "revisio" && (
            <Button
              className="gap-1.5 bg-[#0099A8] hover:bg-[#006E7A] text-white"
              disabled={importing || eligible.length === 0}
              onClick={() => void importar()}
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {progress}/
                  {eligible.length}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Crea {eligible.length}{" "}
                  tag{eligible.length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
