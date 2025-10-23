import { s } from '@hashbrownai/core';

const ingredientUnitSchema = s.enumeration('the unit of the ingredient', [
  'each',
  'dozen',
  'pound',
  'ounce',
  'gallon',
  'case',
  'bag',
  'box',
  'liter',
  'kilogram',
]);

const dailyReportSchema = s.object('a daily report', {
  date: s.string('the date of the daily report'),
  price: s.number('the price of the ingredient on this day'),
  inventory: s.number('the inventory of the ingredient on this day'),
  consumption: s.number('the consumption of the ingredient on this day'),
  wastage: s.number('the wastage of the ingredient on this day'),
  delivered: s.number('the quantity of the delivery on this day'),
});

const ingredientCategorySchema = s.enumeration(
  'the category of the ingredient',
  ['Food', 'Beverage', 'Packaging', 'Cleaning', 'Non-food Supply'],
);

export const ingredientSchema = s.object('an ingredient', {
  id: s.string('the id of the ingredient'),
  name: s.string('the name of the ingredient'),
  category: ingredientCategorySchema,
  unit: ingredientUnitSchema,
  safetyStock: s.number('the safety stock of the ingredient'),
  reorderPoint: s.number('the reorder point of the ingredient'),
  leadTimeDays: s.number('the lead time of the ingredient'),
  currentInventory: s.number('the current inventory of the ingredient'),
  currentUnitCostUSD: s.number('the current unit cost of the ingredient'),
  dailyReports: s.array(
    'the daily reports of the ingredient',
    dailyReportSchema,
  ),
});
