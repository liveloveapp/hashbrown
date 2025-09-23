import INGREDIENTS_JSON from './ingredients.json';

export type Ingredient = {
  id: string;
  dailyReports: { date: string }[];
  [key: string]: unknown;
};

export const INGREDIENTS = INGREDIENTS_JSON as Ingredient[];
