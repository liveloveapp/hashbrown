type ISODate = `${number}-${number}-${number}`;

type Unit =
  | 'each'
  | 'dozen'
  | 'pound'
  | 'ounce'
  | 'gallon'
  | 'case'
  | 'bag'
  | 'box'
  | 'liter'
  | 'kilogram';

export type IngredientCategory =
  | 'Food'
  | 'Beverage'
  | 'Packaging'
  | 'Cleaning'
  | 'Non-food Supply';

interface DailyReport {
  date: ISODate;
  price: number;
  inventory: number;
  consumption: number;
  wastage: number;
  delivered: number;
}

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: Unit;
  safetyStock: number;
  reorderPoint: number;
  leadTimeDays: number;
  currentInventory: number;
  currentUnitCostUSD: number;
  dailyReports: DailyReport[];
}
