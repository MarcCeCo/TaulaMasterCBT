// src/lib/tagImport/types.ts

export type Confianca = "alta" | "mitjana" | "revisar";

export type ColumnRole =
  | "denominacio"
  | "linia"
  | "potencia"
  | "tensio"
  | "ignorar";

export type Grid = string[][];

export interface SheetData {
  name: string;
  grid: Grid;
}

export interface ColumnGuess {
  index: number;
  header: string;
  role: ColumnRole;
  /** 0-1: seguretat de la detecció */
  score: number;
}

export interface DetectedLayout {
  headerRow: number;
  columns: ColumnGuess[];
}

/** Fila llegida del fitxer, ja amb els rols de columna aplicats */
export interface SourceRow {
  id: string;
  /** Número de fila al full (1-based), per referència */
  sourceRow: number;
  linia: string;
  denominacio: string;
  potencia: string;
  tensio: string;
  /** Valors indicats a la plantilla (opcionals): tenen prioritat sobre les regles */
  presetCodi?: string;
  presetCcm?: string;
  presetFuncio?: string;
  presetDuplicitat?: string;
  /** Ordre de procés (sentit del fluid): la numeració segueix aquest ordre */
  ordre?: number;
}

export type RowKind = "equip" | "no-tag" | "desconegut";

export interface ProposedRow extends SourceRow {
  kind: RowKind;
  codiEquip: string;
  confianca: Confianca | null;
  nota: string;
  alternatives: string[];
  ccm: string;
  funcio: string;
  duplicitat: string;
  ordre?: number;
  include: boolean;
}

export type RowStatus =
  | "ok"
  | "no-aplica"
  | "sense-codi"
  | "sense-equip-master"
  | "invalid"
  | "existeix-projecte"
  | "existeix-rosmiman"
  | "duplicat-importacio";

export interface RowEvaluation {
  tag: string;
  status: RowStatus;
  message: string;
}
