import { s } from '@hashbrownai/core';

const nullableStringArray = (description: string) =>
  s.anyOf([s.array(description, s.string('Entry')), s.nullish()]);

const numericInput = (description: string) =>
  s.anyOf([
    s.number(description),
    s.string(`${description} (stringified number)`),
    s.nullish(),
  ]);

export const fastFoodQuerySchema = s.object('fast food dataset query', {
  itemIds: nullableStringArray('Exact menu item identifiers'),
  restaurants: nullableStringArray(
    'Restaurants to include (supports fuzzy matching like "CFA" for Chick-fil-A)',
  ),
  categories: nullableStringArray(
    'Menu categories to include (supports partial matches, e.g., "sal" → Salad)',
  ),
  searchTerm: s.anyOf([
    s.string('Free-text search across restaurant and menu item names'),
    s.nullish(),
  ]),
  maxCalories: numericInput('Maximum calories to include'),
  minCalories: numericInput('Minimum calories to include'),
  minProtein: numericInput('Minimum protein grams'),
  maxSodium: numericInput('Maximum sodium (mg)'),
  limit: numericInput('Maximum number of records to return'),
  sortBy: s.anyOf([
    s.enumeration('Metric used to sort results', [
      'calories',
      'protein',
      'totalFat',
      'sodium',
      'sugar',
    ]),
    s.string('Sort metric as free-form text (normalized to known metrics)'),
    s.nullish(),
  ]),
  sortDirection: s.anyOf([
    s.enumeration('Sort direction', ['asc', 'desc']),
    s.string('Sort direction as text (asc|desc, case-insensitive)'),
    s.nullish(),
  ]),
});
