import { s } from '@hashbrownai/core';

export const fastFoodItemSchema = s.object('fast food menu item', {
  id: s.string('Unique identifier for the menu item'),
  restaurant: s.string('Restaurant or chain name'),
  item: s.string('Full menu item label'),
  shortName: s.string('Short alias for the menu item'),
  description: s.string('Human-readable description'),
  servingSize: s.string('Serving size descriptor'),
  categories: s.array(
    'Menu categories assigned to the item',
    s.string('Category label'),
  ),
  calories: s.number('Total calories (kcal)'),
  totalFat: s.number('Total fat in grams'),
  saturatedFat: s.number('Saturated fat in grams'),
  transFat: s.number('Trans fat in grams'),
  cholesterol: s.number('Cholesterol (mg)'),
  sodium: s.number('Sodium (mg)'),
  totalCarbs: s.number('Total carbohydrates in grams'),
  fiber: s.number('Dietary fiber in grams'),
  sugar: s.number('Sugar in grams'),
  protein: s.number('Protein in grams'),
  sources: s.array(
    'Source URLs that back the nutrition data',
    s.string('Source URL'),
  ),
  lastAudited: s.anyOf([
    s.string('ISO timestamp for the last audit'),
    s.nullish(),
  ]),
});
