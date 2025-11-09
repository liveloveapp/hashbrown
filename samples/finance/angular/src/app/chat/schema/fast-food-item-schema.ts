import { s } from '@hashbrownai/core';

export const fastFoodItemSchema = s.object('fast food menu item', {
  id: s.string('Unique identifier for the menu item'),
  restaurant: s.string('Restaurant name'),
  item: s.string('Menu item name'),
  calories: s.number('Total calories (kcal)'),
  caloriesFromFat: s.number('Calories contributed by fat'),
  totalFat: s.number('Total fat in grams'),
  saturatedFat: s.number('Saturated fat in grams'),
  transFat: s.number('Trans fat in grams'),
  cholesterol: s.number('Cholesterol (mg)'),
  sodium: s.number('Sodium (mg)'),
  totalCarbs: s.number('Total carbohydrates in grams'),
  fiber: s.number('Dietary fiber in grams'),
  sugar: s.number('Sugar in grams'),
  protein: s.number('Protein in grams'),
  vitaminA: s.number('Vitamin A (% daily value)'),
  vitaminC: s.number('Vitamin C (% daily value)'),
  calcium: s.number('Calcium (% daily value)'),
  menuCategory: s.string('Menu grouping or classification'),
});
