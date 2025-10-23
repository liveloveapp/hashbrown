import { s } from '@hashbrownai/core';

export const queryIngredientsSchema = s.object('query parameters', {
  ingredientIds: s.anyOf([
    s.array(
      'focus on specific products, or null to include all products',
      s.string('an individual product id'),
    ),
    s.nullish(),
  ]),
  startDate: s.string('ISO formatted start date'),
  endDate: s.string('ISO formatted end date'),
});
