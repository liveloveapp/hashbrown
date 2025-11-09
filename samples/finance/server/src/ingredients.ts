import INGREDIENTS_JSON from './data';

export type Ingredient = {
  id: string;
  dailyReports: { date: string }[];
  [key: string]: unknown;
};

export const INGREDIENTS = INGREDIENTS_JSON as Ingredient[];
