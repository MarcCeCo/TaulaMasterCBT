// src/lib/visor3dModel.ts
//
// Utilitats del Visualitzador 3D que treballen sobre les propietats dels
// elements del model (Autodesk Viewer SDK):
//   1. escanejaModel()      → llegeix CBT_TAG i la jerarquia CBT_SISTEMA >
//                             CBT_SUBSISTEMA > CBT_LINIA_DE_TRACTAMENT >
//                             CBT_PROCES > CBT_SUBPROCES de tots els elements.
//   2. construeixArbre()    → agrupa els elements en l'arbre de jerarquia.
//   3. seleccionaAlViewer() → selecció múltiple d'elements al visor.
//   4. exportaInformeTags() → informe .xlsx amb els TAGs donats d'alta
//                             (Rosmiman) que NO són al model.

import type { ExternalObject } from "@/lib/dbTypes";

// ─── Jerarquia ────────────────────────────────────────────────────────────────

export const NIVELLS_JERARQUIA = [
  { etiqueta: "Sistema", param: "SISTEMA" },
  { etiqueta: "Subsistema", param: "SUBSISTEMA" },
  { etiqueta: "Línia de tractament", param: "LINIA_DE_TRACTAMENT" },
  { etiqueta: "Procés", param: "PROCES" },
  { etiqueta: "Subprocés", param: "SUBPROCES" },
] as const;

export const SENSE_VALOR = "(sense valor)";
export const SENSE_JERARQUIA = "(sense jerarquia)";

export const normTag = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toUpperCase();

/** Els TAGs que contenen «CN00» no es tenen en compte (ni al recompte ni a l'informe). */
export const tagIgnorat = (tag: unknown): boolean =>
  normTag(tag).includes("CN00");

/** Nom del paràmetre normalitzat: majúscules, espais → "_" i sense prefix CBT_ */
function claParam(nom: unknown): string {
  return normTag(nom).replace(/\s+/g, "_").replace(/^CBT_/, "");
}

// Noms que demanem al Viewer (amb i sense prefix, per ser tolerants)
const PROP_FILTER = ["TAG", ...NIVELLS_JERARQUIA.map((n) => n.param)].flatMap(
  (p) => [`CBT_${p}`, p],
);

const CLAUS_NIVELL = NIVELLS_JERARQUIA.map((n) => n.param as string);

// ─── Element del model ────────────────────────────────────────────────────────

export interface ElementModel {
  model: ExternalObject;
  modelId: number;
  dbId: number;
  /** "" = sense TAG */
  tag: string;
  /** Valor dels 5 nivells de la jerarquia ("" = buit) */
  nivells: string[];
}

// ─── Escaneig del model ───────────────────────────────────────────────────────

function idsFulles(model: ExternalObject): Promise<number[]> {
  return new Promise((resolve) => {
    model.getObjectTree(
      (tree: ExternalObject) => {
        const ids: number[] = [];
        tree.enumNodeChildren(
          tree.getRootId(),
          (id: number) => {
            if (tree.getChildCount(id) === 0) ids.push(id);
          },
          true,
        );
        resolve(ids);
      },
      // Models sense arbre d'objectes (p. ex. plànols 2D): no hi ha res a escanejar
      () => resolve([]),
    );
  });
}

function propietatsEnBloc(
  model: ExternalObject,
  ids: number[],
): Promise<ExternalObject[]> {
  return new Promise((resolve) => {
    model.getBulkProperties(
      ids,
      { propFilter: PROP_FILTER },
      (res: ExternalObject[]) => resolve(res ?? []),
      (err: ExternalObject) => {
        console.warn("[Visor3D] Error llegint propietats en bloc", err);
        resolve([]);
      },
    );
  });
}

/**
 * Llegeix el TAG i la jerarquia de tots els elements (fulles) d'un model.
 * Només retorna els elements que tenen TAG o algun nivell de jerarquia omplert.
 */
export async function escanejaModel(
  model: ExternalObject,
  onProgres: (fraccio: number) => void,
  cancelat: () => boolean,
): Promise<ElementModel[]> {
  const ids = await idsFulles(model);
  const resultat: ElementModel[] = [];
  const MIDA_BLOC = 2000;

  for (let i = 0; i < ids.length; i += MIDA_BLOC) {
    if (cancelat()) return [];
    const bloc = ids.slice(i, i + MIDA_BLOC);
    const files = await propietatsEnBloc(model, bloc);
    for (const fila of files) {
      let tag = "";
      const nivells = ["", "", "", "", ""];
      for (const p of (fila.properties ?? []) as ExternalObject[]) {
        const clau = claParam(p.displayName ?? p.attributeName);
        const valor = String(p.displayValue ?? "").trim();
        if (!valor) continue;
        if (clau === "TAG") tag = normTag(valor);
        else {
          const idx = CLAUS_NIVELL.indexOf(clau);
          if (idx >= 0) nivells[idx] = valor;
        }
      }
      if (tag || nivells.some(Boolean)) {
        resultat.push({
          model,
          modelId: model.id,
          dbId: fila.dbId,
          tag,
          nivells,
        });
      }
    }
    onProgres(Math.min(1, (i + bloc.length) / ids.length));
    // Cedeix el fil principal perquè el visor no es bloquegi
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgres(1);
  return resultat;
}

// ─── Arbre de jerarquia ───────────────────────────────────────────────────────

export interface NodeJerarquia {
  /** Identificador únic (camí complet) */
  id: string;
  /** 0..4 = índex a NIVELLS_JERARQUIA; -1 = node arrel "sense jerarquia" */
  nivell: number;
  nom: string;
  /** Tots els elements d'aquest node i dels seus descendents */
  elements: ElementModel[];
  /** Elements que s'aturen en aquest nivell (no tenen valors més avall) */
  directs: ElementModel[];
  fills: NodeJerarquia[];
}

export function construeixArbre(elements: ElementModel[]): NodeJerarquia[] {
  const arrels = new Map<string, NodeJerarquia>();
  const SEP = "\u0001";

  const obteNode = (
    mapa: Map<string, NodeJerarquia>,
    id: string,
    nivell: number,
    nom: string,
  ): NodeJerarquia => {
    let n = mapa.get(id);
    if (!n) {
      n = { id, nivell, nom, elements: [], directs: [], fills: [] };
      mapa.set(id, n);
    }
    return n;
  };

  // Mapa pla per accedir ràpid als nodes de qualsevol profunditat
  const tots = new Map<string, NodeJerarquia>();

  for (const el of elements) {
    let ultim = -1;
    el.nivells.forEach((v, i) => {
      if (v) ultim = i;
    });

    if (ultim < 0) {
      // Té TAG però cap nivell de jerarquia
      const n = obteNode(arrels, SENSE_JERARQUIA, -1, SENSE_JERARQUIA);
      n.elements.push(el);
      n.directs.push(el);
      continue;
    }

    let camí = "";
    let pare: NodeJerarquia | null = null;
    for (let i = 0; i <= ultim; i++) {
      const nom = el.nivells[i] || SENSE_VALOR;
      camí += SEP + nom;
      let node = tots.get(camí);
      if (!node) {
        node = {
          id: camí,
          nivell: i,
          nom,
          elements: [],
          directs: [],
          fills: [],
        };
        tots.set(camí, node);
        if (pare) pare.fills.push(node);
        else arrels.set(camí, node);
      }
      node.elements.push(el);
      if (i === ultim) node.directs.push(el);
      pare = node;
    }
  }

  const ordena = (llista: NodeJerarquia[]) => {
    llista.sort((a, b) => {
      // "(sense ...)" sempre al final
      const sa = a.nom.startsWith("(sense") ? 1 : 0;
      const sb = b.nom.startsWith("(sense") ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return a.nom.localeCompare(b.nom, "ca", { numeric: true });
    });
    llista.forEach((n) => ordena(n.fills));
  };
  const resultat = [...arrels.values()];
  ordena(resultat);
  return resultat;
}

// ─── Selecció múltiple al visor ───────────────────────────────────────────────

/** Selecciona (i enquadra) un conjunt d'elements, també si són de models diferents. */
export function seleccionaAlViewer(
  viewer: ExternalObject,
  elements: ElementModel[],
) {
  if (!viewer) return;
  const perModel = new Map<
    number,
    { model: ExternalObject; ids: Set<number> }
  >();
  for (const el of elements) {
    const g = perModel.get(el.modelId) ?? { model: el.model, ids: new Set() };
    g.ids.add(el.dbId);
    perModel.set(el.modelId, g);
  }
  const grups = [...perModel.values()].map((g) => ({
    model: g.model,
    ids: [...g.ids],
  }));

  if (grups.length === 0) {
    viewer.clearSelection();
    return;
  }

  const selector = viewer.impl?.selector;
  if (selector?.setAggregateSelection) {
    selector.setAggregateSelection(grups);
  } else {
    viewer.select(grups[0].ids, grups[0].model);
  }
  try {
    viewer.fitToView(grups[0].ids, grups[0].model);
  } catch {
    /* ignora */
  }
}

// ─── Informe: TAGs donats d'alta que no són al model ─────────────────────────

export interface TagAlta {
  tag: string;
  descripcio: string;
}

export interface DadesInforme {
  instalacioNom: string;
  instalacioCodi: string;
  sistemaNom: string;
  /** Tots els TAGs donats d'alta (Rosmiman) d'aquesta instal·lació */
  tagsAlta: TagAlta[];
  /** TAGs trobats al model */
  tagsModel: Set<string>;
}

/** TAGs donats d'alta que no apareixen al model */
export function tagsNoAlModel(
  tagsAlta: TagAlta[],
  tagsModel: Set<string>,
): TagAlta[] {
  return tagsAlta.filter(
    (t) => !tagIgnorat(t.tag) && !tagsModel.has(normTag(t.tag)),
  );
}

export async function exportaInformeTags(d: DadesInforme): Promise<void> {
  // PERF: xlsx es carrega lazily
  const XLSX = await import("xlsx");
  const absents = tagsNoAlModel(d.tagsAlta, d.tagsModel);
  const alta = d.tagsAlta.filter((t) => !tagIgnorat(t.tag));
  const alModel = alta.length - absents.length;

  const resum: (string | number)[][] = [
    ["INFORME DE TAGS — VISUALITZADOR 3D"],
    [],
    ["Sistema", d.sistemaNom],
    ["Instal·lació", d.instalacioNom],
    ["Codi instal·lació", d.instalacioCodi],
    ["Data", new Date().toLocaleString("ca-ES")],
    [],
    ["Equips donats d'alta (Rosmiman, sense CN00)", alta.length],
    ["Donats d'alta i presents al model", alModel],
    ["Donats d'alta i NO presents al model", absents.length],
    ["TAGs diferents trobats al model", d.tagsModel.size],
  ];
  const wsResum = XLSX.utils.aoa_to_sheet(resum);
  wsResum["!cols"] = [{ wch: 40 }, { wch: 40 }];

  const wsAbsents = XLSX.utils.json_to_sheet(
    absents.map((t) => ({ TAG: t.tag, DESCRIPCIÓ: t.descripcio })),
    { header: ["TAG", "DESCRIPCIÓ"] },
  );
  wsAbsents["!cols"] = [{ wch: 28 }, { wch: 60 }];
  wsAbsents["!freeze"] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResum, "RESUM");
  XLSX.utils.book_append_sheet(wb, wsAbsents, "TAGS NO AL MODEL");

  const data = new Date().toISOString().slice(0, 10);
  const codi = (d.instalacioCodi || "instalacio").replace(/[^\w-]+/g, "_");
  XLSX.writeFile(wb, `informe_tags_${codi}_${data}.xlsx`);
}
