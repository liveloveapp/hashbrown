import type { createReviewMiddleware } from './review-middleware';

type ReviewTools = Extract<
  Awaited<ReturnType<ReturnType<typeof createReviewMiddleware>>>,
  { action: 'continue' }
>['context'];

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Resolve validated server middleware capabilities before running a review tool. */
export function reviewTools(context: unknown): ReviewTools {
  if (!record(context) || !record(context.middleware))
    throw new Error('invalid_review_middleware');
  const middleware = context.middleware;
  if (
    typeof middleware.prepareAllocation !== 'function' ||
    typeof middleware.applyAllocation !== 'function'
  )
    throw new Error('invalid_review_middleware');
  return middleware as ReviewTools;
}
