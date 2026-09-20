import { isDeepStrictEqual } from 'node:util';
import { assistantResponseSchema } from '@invoicing/contracts';
import type {
  AssistantRenderInput,
  LedgerSnapshot,
} from '@invoicing/contracts';
import {
  aging,
  customerStatement,
  findRecords,
  ledgerSummary,
  monthlyTotals,
  unappliedPayments,
} from './assistant-queries';
import { validateUi } from './assistant-ui';
import type { SessionStore } from './session-store';
import type { ThreadRepository } from './persistence/types';
import { readSessionCookie } from './session-cookie';
import { assertThreadOwner } from './thread-ownership';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The middleware context the assistant's tools read (`assistantTools` in
 * `assistant-tools.ts`): the response schema the nested `render` model is
 * held to, the six read-only queries, and `validateUi`, each closed over
 * `current`, which yields the ledger snapshot a call should see. The route
 * middleware builds it from a session; the eval harness from the sample
 * ledger directly, so both share this one shape.
 */
export function assistantContext(current: () => Promise<LedgerSnapshot>) {
  return Object.freeze({
    responseSchema: assistantResponseSchema,
    ledgerSummary: async () => ledgerSummary(await current()),
    monthlyTotals: async (input: Parameters<typeof monthlyTotals>[1]) =>
      monthlyTotals(await current(), input),
    aging: async (input: Parameters<typeof aging>[1]) =>
      aging(await current(), input),
    customerStatement: async (input: Parameters<typeof customerStatement>[1]) =>
      customerStatement(await current(), input),
    findRecords: async (input: Parameters<typeof findRecords>[1]) =>
      findRecords(await current(), input),
    unappliedPayments: async (input: Parameters<typeof unappliedPayments>[1]) =>
      unappliedPayments(await current(), input),
    validateUi: async (input: AssistantRenderInput) =>
      validateUi(await current(), input),
  });
}

/** Read-only query and UI-validation capabilities scoped to a cookie, thread and generation. */
export function createAssistantMiddleware(
  store: SessionStore,
  threads: ThreadRepository,
) {
  return async (request: {
    readonly method: string;
    readonly routeId: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: unknown;
  }) => {
    const reject = (status: number) => ({
      action: 'reject' as const,
      status,
      body: { error: 'invalid_conversation' },
    });
    if (request.method !== 'POST' || request.routeId !== '/assistant')
      return reject(404);
    const sessionId = readSessionCookie(request.headers.cookie);
    let generation: number;
    try {
      if (!sessionId) return reject(401);
      generation = await store.generation(sessionId);
    } catch {
      return reject(401);
    }
    const body = request.body;
    if (
      !record(body) ||
      typeof body.threadId !== 'string' ||
      !body.threadId.trim() ||
      body.threadId.length > 256 ||
      typeof body.runId !== 'string' ||
      !body.runId.trim() ||
      !record(body.state) ||
      !record(body.hashbrown) ||
      body.hashbrown.ui !== true ||
      !isDeepStrictEqual(
        body.hashbrown.responseSchema,
        assistantResponseSchema,
      ) ||
      (body.resume !== undefined &&
        (!Array.isArray(body.resume) || body.resume.length > 0)) ||
      (body.tools !== undefined &&
        (!Array.isArray(body.tools) || body.tools.length > 0)) ||
      (body.forwardedProps !== undefined &&
        (!record(body.forwardedProps) ||
          Object.keys(body.forwardedProps).length > 0))
    )
      return reject(422);
    const owner = (await threads.load(body.threadId))?.value;
    if (owner) {
      // Both a foreign thread and a thread left behind by a reset are the same
      // answer to this caller: stop using it and open a new one.
      try {
        assertThreadOwner(owner, {
          sessionId,
          routeId: '/assistant',
          generation,
        });
      } catch {
        return reject(422);
      }
    }
    const current = async () => {
      if ((await store.generation(sessionId)) !== generation)
        throw new Error('stale_generation');
      return store.snapshot(sessionId);
    };
    const selectedPaymentId = body.state.selectedPaymentId;
    if (
      selectedPaymentId !== undefined &&
      (typeof selectedPaymentId !== 'string' ||
        !(await current()).payments.some((p) => p.id === selectedPaymentId))
    )
      return reject(422);
    return { action: 'continue' as const, context: assistantContext(current) };
  };
}
