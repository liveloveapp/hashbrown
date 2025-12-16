import type { Ingredient, IngredientQuery } from '../models/ingredient';

export async function fetchIngredients(
  query: IngredientQuery,
  abortSignal?: AbortSignal,
): Promise<Ingredient[]> {
  const search = new URLSearchParams();

  if (query.startDate) search.set('startDate', query.startDate);
  if (query.endDate) search.set('endDate', query.endDate);
  if (query.ingredientIds) {
    for (const id of query.ingredientIds) {
      search.append('ingredientIds', id);
    }
  }

  const queryString = search.toString();
  const url = queryString
    ? `api/ingredients?${queryString}`
    : 'api/ingredients';

  const response = await fetch(`http://localhost:3000/${url}`, {
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch ingredients');
  }

  return (await response.json()) as Ingredient[];
}
