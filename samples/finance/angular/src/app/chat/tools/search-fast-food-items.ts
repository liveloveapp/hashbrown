import { inject } from '@angular/core';
import { createTool } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { lastValueFrom } from 'rxjs';
import { FastFoodDatasetService } from '../data/fast-food-dataset.service';
import { FastFoodSortMetric } from '../models/fast-food-item';

const searchSchema = s.object('fast food dataset search parameters', {
  query: s.string(
    'Free-text search across restaurant and menu item names (empty string to skip)',
  ),
  restaurants: s.array(
    'Restaurants to include (leave empty for all)',
    s.string('Restaurant name'),
  ),
  categories: s.array(
    'Menu categories to include (leave empty for all)',
    s.string('Category label'),
  ),
  maxCalories: s.string('Maximum calories per item; empty string to ignore'),
  minProtein: s.string('Minimum protein grams; empty string to ignore'),
  maxSodium: s.string('Maximum sodium in milligrams; empty string to ignore'),
  limit: s.string(
    'Maximum number of menu items to return (empty string uses default 25)',
  ),
  sortBy: s.enumeration('Metric used to sort results (empty string to skip)', [
    '',
    'calories',
    'protein',
    'totalFat',
    'sodium',
    'sugar',
  ]),
  sortDirection: s.enumeration('Sort direction (empty string to skip)', [
    '',
    'asc',
    'desc',
  ]),
});

export const searchFastFoodItemsTool = createTool({
  name: 'searchFastFoodItems',
  description:
    'Search the fast-food nutrition dataset by restaurant, category, or macronutrient thresholds.',
  schema: searchSchema,
  handler: async (input) => {
    const dataset = inject(FastFoodDatasetService);

    const toNumber = (value?: string) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const toLimit = (value?: string) => {
      const parsed = toNumber(value);
      if (parsed === null) {
        return null;
      }
      const rounded = Math.floor(parsed);
      return rounded > 0 ? rounded : null;
    };

    const normalizeList = (values?: string[]) => {
      if (!values?.length) {
        return null;
      }
      const cleaned = values
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      return cleaned.length ? cleaned : null;
    };

    const isSortMetric = (value: string): value is FastFoodSortMetric =>
      value === 'calories' ||
      value === 'protein' ||
      value === 'totalFat' ||
      value === 'sodium' ||
      value === 'sugar';

    const normalizeSortBy = (value?: string): FastFoodSortMetric | null => {
      const trimmed = value?.trim();
      if (!trimmed || !isSortMetric(trimmed)) {
        return null;
      }
      return trimmed;
    };

    const normalizeSortDirection = (value?: string): 'asc' | 'desc' | null => {
      const trimmed = value?.trim();
      if (trimmed === 'asc' || trimmed === 'desc') {
        return trimmed;
      }
      return null;
    };

    const results = await lastValueFrom(
      dataset.queryItems({
        searchTerm: input.query?.trim() ? input.query.trim() : null,
        restaurants: normalizeList(input.restaurants),
        categories: normalizeList(input.categories),
        maxCalories: toNumber(input.maxCalories),
        minProtein: toNumber(input.minProtein),
        maxSodium: toNumber(input.maxSodium),
        limit: toLimit(input.limit) ?? 25,
        sortBy: normalizeSortBy(input.sortBy),
        sortDirection: normalizeSortDirection(input.sortDirection),
      }),
    );

    return results.map((item) => ({
      id: item.id,
      restaurant: item.restaurant,
      item: item.item,
      calories: item.calories,
      caloriesFromFat: item.caloriesFromFat,
      totalFat: item.totalFat,
      protein: item.protein,
      sodium: item.sodium,
      totalCarbs: item.totalCarbs,
      menuCategory: item.menuCategory,
    }));
  },
});
