import { s } from '@hashbrownai/core';

export const fastFoodQuerySchema = s.object('fast food dataset query', {
  itemIds: s.anyOf([
    s.array('Exact menu item identifiers', s.string('Menu item id')),
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
  searchTerm: s.anyOf([
    s.string('Free-text search across restaurant and menu item names'),
    s.nullish(),
  ]),
  maxCalories: s.anyOf([s.number('Maximum calories to include'), s.nullish()]),
  minCalories: s.anyOf([s.number('Minimum calories to include'), s.nullish()]),
  minProtein: s.anyOf([s.number('Minimum protein grams'), s.nullish()]),
  maxSodium: s.anyOf([s.number('Maximum sodium (mg)'), s.nullish()]),
  limit: s.anyOf([s.number('Maximum number of records to return'), s.nullish()]),
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
