/** Tipus d'un equip de la Taula Master (les dades viuen a DataStore). */
export type Equipment = {
  id: string;
  gubimCode: string;
  equipCode: string;
  equipName: string;
  needsTable: boolean;
  tableCode: string;
  tableName: string;
  fieldCols: string[];
  parentEquipCode: string;
  revitCategory: string;
  createdAt: number;
};
