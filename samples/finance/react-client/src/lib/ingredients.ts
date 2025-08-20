export type ISODate = `${number}-${number}-${number}`;
export type Unit =
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

export interface DailyReport {
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

export type IngredientSummary = Pick<
  Ingredient,
  | 'id'
  | 'name'
  | 'category'
  | 'unit'
  | 'currentInventory'
  | 'currentUnitCostUSD'
>;

export async function fetchIngredients(params: {
  startDate: ISODate;
  endDate: ISODate;
  ingredientIds?: string[];
}) {
  const search = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
  });
  if (params.ingredientIds) {
    for (const id of params.ingredientIds) search.append('ingredientIds', id);
  }
  const res = await fetch(`/api/ingredients?${search.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch ingredients: ${res.status}`);
  return (await res.json()) as Ingredient[];
}
