import { inject } from '@angular/core';
import { createTool } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { lastValueFrom } from 'rxjs';
import { FastFoodDatasetService } from '../data/fast-food-dataset.service';

const searchSchema = s.object('fast food dataset search parameters', {
  query: s.anyOf([
    s.string('Free-text search across restaurant and menu item names'),
    s.nullish(),
  ]),
  restaurants: s.anyOf([
    s.array('Restaurants to include', s.string('Restaurant name')),
    s.nullish(),
  ]),
  categories: s.anyOf([
    s.array('Menu categories to include', s.string('Category label')),
    s.nullish(),
  ]),
  maxCalories: s.anyOf([s.number('Maximum calories per item'), s.nullish()]),
  minProtein: s.anyOf([s.number('Minimum protein grams'), s.nullish()]),
  maxSodium: s.anyOf([s.number('Maximum sodium in milligrams'), s.nullish()]),
  limit: s.anyOf([
    s.number('Maximum number of menu items to return (defaults to 25)'),
    s.nullish(),
  ]),
  sortBy: s.anyOf([
    s.enumeration('Metric used to sort results', [
      'calories',
      'protein',
      'totalFat',
      'sodium',
      'sugar',
    ]),
    s.nullish(),
  ]),
  sortDirection: s.anyOf([
    s.enumeration('Sort direction', ['asc', 'desc']),
    s.nullish(),
  ]),
});

export const searchFastFoodItemsTool = createTool({
  name: 'searchFastFoodItems',
  description:
    'Search the fast-food nutrition dataset by restaurant, category, or macronutrient thresholds.',
  schema: searchSchema,
  handler: async (input) => {
    const dataset = inject(FastFoodDatasetService);

    const results = await lastValueFrom(
      dataset.queryItems({
        searchTerm: input.query ?? null,
        restaurants: input.restaurants ?? null,
        categories: input.categories ?? null,
        maxCalories: input.maxCalories ?? null,
        minProtein: input.minProtein ?? null,
        maxSodium: input.maxSodium ?? null,
        limit: input.limit ?? 25,
        sortBy: input.sortBy ?? null,
        sortDirection: input.sortDirection ?? null,
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
