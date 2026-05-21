import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { X, ListChecks } from "lucide-react";
import { Equipment } from "@/hooks/useEquipments";
import { GubimNode } from "@/hooks/useGubimClass";
import { FieldMeta } from "@/lib/fields";
import { GubimClassPicker } from "./GubimClassPicker";
import { FieldPickerDialog } from "./FieldPickerDialog";
import { uid } from "@/lib/storage";
import { toast } from "sonner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

// Categories Revit agrupades per disciplina
// Clau: valor guardat a la BD  |  Valor: nom visible al selector
export const REVIT_CATEGORIES_BY_GROUP: Record<string, string[]> = {
  "Mecànica / MEP": [
    "Mechanical Equipment",
    "Specialty Equipment",
    "Plumbing Fixtures",
    "Mechanical Control Devices",
    "Air Terminals",
    "Fire Protection",
    "Sprinklers",
  ],
  "Canonades": [
    "Pipe Accessories",
    "Pipe Fittings",
    "Pipes",
  ],
  "Conductes": [
    "Duct Accessories",
    "Duct Fittings",
    "Ducts",
  ],
  "Elèctrica": [
    "Electrical Equipment",
    "Electrical Fixtures",
    "Lighting Fixtures",
    "Lighting Devices",
    "Communication Devices",
    "Data Devices",
    "Fire Alarm Devices",
    "Security Devices",
    "Cable Trays",
    "Conduits",
  ],
  "Estructura": [
    "Structural Columns",
    "Structural Framing",
    "Structural Foundations",
  ],
  "Arquitectura / General": [
    "Generic Models",
    "Vertical Circulation",
    "Furniture",
    "Casework",
    "Walls",
    "Doors",
    "Windows",
  ],
};

// Llista plana per a validació (valors únics)
export const REVIT_CATEGORIES_FLAT: string[] = Object.values(REVIT_CATEGORIES_BY_GROUP).flat();

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  editing?: Equipment | null;
  nodes: GubimNode[];
  nodeMap: Map<string, GubimNode>;
  fields: FieldMeta[];
  fieldMap: Map<string, FieldMeta>;
  onSubmit: (e: Equipment) => Promise<void>;
  isCodeTaken: (code: string, excludeId?: string) => boolean;
  allEquipments: Equipment[];
}

export function EquipmentFormDialog({ open, onOpenChange, editing, nodes, nodeMap, fields, fieldMap, onSubmit, isCodeTaken, allEquipments }: Props) {
  const [gubim, setGubim] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [needs, setNeeds] = useState(false);
  const [cols, setCols] = useState<string[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [parentEquipCode, setParentEquipCode] = useState("");
  const [revitCategory,   setRevitCategory]   = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setGubim(editing.gubimCode); setCode(editing.equipCode); setName(editing.equipName);
      setNeeds(editing.needsTable); setCols(editing.fieldCols); setParentEquipCode(editing.parentEquipCode ?? "");
      setRevitCategory(editing.revitCategory ?? "");
    } else {
      setGubim(""); setCode(""); setName(""); setNeeds(false); setCols([]); setParentEquipCode("");
      setRevitCategory("");
    }
  }, [open, editing]);

  const sanitizedCode = code.trim().toUpperCase();
  const sanitizedName = name.trim();
  // tableCode: "T" + codi si té codi, buit si no
  const tableCode = needs && sanitizedCode ? "T" + sanitizedCode : "";
  // tableName = "NomMare NomFill" si hi ha equip pare, sinó sol el nom
  // parentEquipCode pot contenir un equipCode o un id (per pares sense codi)
  const parentEquip = parentEquipCode
    ? (allEquipments.find(e => e.equipCode === parentEquipCode) ?? allEquipments.find(e => e.id === parentEquipCode))
    : null;
  const tableName = needs && sanitizedName
    ? (parentEquip ? `${parentEquip.equipName} ${sanitizedName}` : sanitizedName)
    : "";

  // Equips candidats a ser pares (mateixa gubimCode, diferent id, amb o sense codi)
  const parentCandidates = allEquipments.filter(e => e.gubimCode === gubim && e.id !== editing?.id);

  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!gubim) return toast.error("Selecciona una GuBIMClass");
    const C = code.trim().toUpperCase();
    if (C && !/^[A-Z0-9]{1,4}$/.test(C)) return toast.error("Codi d'equip invàlid (màx 4 alfanumèric)");
    if (C && isCodeTaken(C, editing?.id)) return toast.error("Aquest codi ja existeix");
    if (!name.trim()) return toast.error("El nom és obligatori");

    // parentEquipCode pot contenir equipCode o id; resolem per codi primer, si no per id
    const parentE = parentEquipCode
      ? (allEquipments.find(e => e.equipCode === parentEquipCode) ?? allEquipments.find(e => e.id === parentEquipCode))
      : null;
    const computedTableName = needs
      ? (parentE ? `${parentE.equipName} ${name.trim()}` : name.trim())
      : "";
    const e: Equipment = {
      id: editing?.id ?? uid(),
      gubimCode: gubim,
      equipCode: C,
      equipName: name.trim(),
      needsTable: needs,
      tableCode: needs && C ? "T" + C : "",
      tableName: computedTableName,
      fieldCols: needs ? cols : [],
      parentEquipCode: parentEquipCode,
      revitCategory: revitCategory,
      createdAt: editing?.createdAt ?? Date.now(),
    };
    setSaving(true);
    try {
      await onSubmit(e);
      // El pare és responsable de tancar el diàleg (onOpenChange)
    } catch (err: any) {
      // L'error ja es mostra via toast al pare, però assegurem que setSaving es reseteja
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="text-base font-semibold">
            {editing ? "Edita equip" : "Nou equip"}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 pr-1">
        <div className="grid grid-cols-2 gap-3 py-2">
          {/* GuBIMClass - ocupa tota l'amplada */}
          <div className="col-span-2 space-y-1.5">
            <Label>GuBIMClass *</Label>
            <GubimClassPicker nodes={nodes} nodeMap={nodeMap} value={gubim} onChange={(v) => { setGubim(v); setParentEquipCode(""); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Codi equip <span className="text-muted-foreground text-xs">(opcional, màx 4)</span></Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={4} className="font-mono uppercase" placeholder="ex. RNA" />
          </div>
          <div className="space-y-1.5">
            <Label>Nom equip *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Refredadora aire-aigua" />
          </div>

          {/* Equip pare (jerarquia intra-gubim) */}
          {parentCandidates.length > 0 && (
            <div className="col-span-2 space-y-1.5">
              <Label>Equip pare <span className="text-muted-foreground text-xs">(opcional — per a components/tipologies)</span></Label>
              <Select value={parentEquipCode || "__none__"} onValueChange={(v) => setParentEquipCode(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sense pare (equip principal)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sense pare (equip principal)</SelectItem>
                  {parentCandidates.map(e => (
                    <SelectItem key={e.id} value={e.equipCode || e.id}>
                      {e.equipCode ? `${e.equipCode} · ${e.equipName}` : e.equipName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Categoria Revit */}
          <div className="col-span-2 space-y-1.5">
            <Label>Categoria Revit <span className="text-muted-foreground text-xs">(per a la família .rfa)</span></Label>
            <Select value={revitCategory || "__none__"} onValueChange={(v) => setRevitCategory(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona categoria…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Sense categoria —</SelectItem>
                {Object.entries(REVIT_CATEGORIES_BY_GROUP).map(([group, cats]) => (
                  <SelectGroup key={group}>
                    <SelectLabel className="text-xs text-muted-foreground">{group}</SelectLabel>
                    {cats.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 flex items-center gap-3 p-2 rounded-md bg-muted/40">
            <Switch checked={needs} onCheckedChange={setNeeds} id="needs" />
            <Label htmlFor="needs" className="cursor-pointer">Necessita taula de propietats</Label>
          </div>

          {needs && (
            <>
              <div className="space-y-1.5">
                <Label>Codi taula</Label>
                <Input value={tableCode} readOnly className="bg-muted/50 font-mono" placeholder="S'omple automàticament" />
              </div>
              <div className="space-y-1.5">
                <Label>Nom taula</Label>
                <Input value={tableName} readOnly className="bg-muted/50" />
              </div>
              <div className="col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Camps de la taula ({cols.length})</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPickOpen(true)}>
                    <ListChecks className="h-4 w-4" /> Selecciona camps
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[60px] bg-muted/20">
                  {cols.length === 0 && <span className="text-xs text-muted-foreground">Cap camp seleccionat</span>}
                  {cols.map((c) => {
                    const f = fieldMap.get(c);
                    const label = f?.col ?? c;
                    return (
                      <Badge key={c} variant="secondary" className="gap-1">
                        <span className="text-xs">{label}</span>
                        <button type="button" onClick={() => setCols((p) => p.filter((x) => x !== c))}><X className="h-3 w-3" /></button>
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        </div>
        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel·la</Button>
          <Button onClick={submit} disabled={saving} className="bg-[#0099A8] hover:bg-[#006E7A]">{saving ? "Desant…" : (editing ? "Desa" : "Crea")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <FieldPickerDialog open={pickOpen} onOpenChange={setPickOpen} fields={fields} initialSelected={cols} onConfirm={setCols} />
    </>
  );
}
