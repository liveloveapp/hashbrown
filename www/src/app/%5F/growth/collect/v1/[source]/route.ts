import {
  createCollectionRoute,
  defaultCollectionRouteDependencies,
} from '../../../../../../lib/growth/collection-route';

export const runtime = 'nodejs';
const handle = createCollectionRoute(defaultCollectionRouteDependencies());
type Context = { params: Promise<{ source: string }> };

/** POST /_/growth/collect/v1/[source]: accepts one observation batch. */
export async function POST(request: Request, context: Context) {
  return handle(request, (await context.params).source);
}

/** OPTIONS /_/growth/collect/v1/[source]: the CORS preflight. */
export async function OPTIONS(request: Request, context: Context) {
  return handle(request, (await context.params).source);
}
