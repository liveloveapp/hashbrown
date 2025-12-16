export interface FastFoodItem {
  id: string;
  restaurant: string;
  item: string;
  shortName: string;
  description: string;
  servingSize: string;
  categories: string[];
  calories: number;
  totalFat: number;
  saturatedFat: number;
  transFat: number;
  cholesterol: number;
  sodium: number;
  totalCarbs: number;
  fiber: number;
  sugar: number;
  protein: number;
  sources: string[];
  lastAudited: string | null;
}

export type FastFoodSortMetric =
  | 'calories'
  | 'protein'
  | 'totalFat'
  | 'sodium'
  | 'sugar';

export interface FastFoodQueryOptions {
  itemIds?: string[] | null;
  restaurants?: string[] | null;
  categories?: string[] | null;
  searchTerm?: string | null;
  maxCalories?: number | null;
  minCalories?: number | null;
  minProtein?: number | null;
  maxSodium?: number | null;
  limit?: number | null;
  sortBy?: FastFoodSortMetric | null;
  sortDirection?: 'asc' | 'desc' | null;
}
