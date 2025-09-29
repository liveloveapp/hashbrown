import INGREDIENTS_JSON from './ingredients.json';

type Ingredient = {
  id: string;
  dailyReports: { date: string }[];
  [key: string]: unknown;
};

const INGREDIENTS = INGREDIENTS_JSON as Ingredient[];

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const url = new URL(request.url);

  const startDateString = url.searchParams.get('startDate');
  const endDateString = url.searchParams.get('endDate');
  const ingredientIds = url.searchParams.getAll('ingredientIds');

  if (!startDateString || !endDateString) {
    return json(
      { error: 'startDate and endDate are required' },
      { status: 400 },
    );
  }

  const startDate = new Date(startDateString);
  const endDate = new Date(endDateString);

  const ingredients = INGREDIENTS.filter((ingredient) => {
    if (
      ingredientIds &&
      ingredientIds.length > 0 &&
      !ingredientIds.includes(ingredient.id)
    ) {
      return false;
    }
    return true;
  }).map((ingredient) => ({
    ...ingredient,
    dailyReports: ingredient.dailyReports.filter((report) => {
      const date = new Date(report.date);
      return date >= startDate && date <= endDate;
    }),
  }));

  return json(ingredients);
}
