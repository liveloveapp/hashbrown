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
  focusedClient,
  ledgerSummary,
  monthlyTotals,
  selectedPayment,
  unappliedPayments,
} from './assistant-queries';
import { validateUi } from './assistant-ui';
import type { SessionStore } from './session-store';
import type { ThreadRepository } from './persistence/types';
import { readSessionCookie } from './session-cookie';
import { assertThreadOwner } from './thread-ownership';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What the page says it is looking at, each ID already checked against the ledger. */
export interface AssistantSelection {
  readonly selectedPaymentId?: string;
  readonly focusedClientId?: string;
  readonly focusedInvoiceId?: string;
}

const SELECTION_KEYS = [
  'selectedPaymentId',
  'focusedClientId',
  'focusedInvoiceId',
] as const;

/**
 * The middleware context the assistant's tools read (`assistantTools` in
 * `assistant-tools.ts`): the response schema the nested `render` model is
 * held to, the read-only queries (including the page's selected payment and focused client), and `validateUi`, each closed over
 * `current`, which yields the ledger snapshot a call should see. The route
 * middleware builds it from a session; the eval harness from the sample
 * ledger directly, so both share this one shape.
 *
 * It also carries `rendered`, the marker `after` in `middleware.ts` reads to
 * learn whether this run ever validated UI through `render`. `Object.freeze`
 * is shallow, so the holder stays mutable inside the frozen context, and
 * `after` receives the very object `handle` allowed, which is why no
 * run-correlation map is needed. The marker is invisible to the model: the
 * six query tools and `validateUi` return exactly what they did before.
 */
export function assistantContext(
  current: () => Promise<LedgerSnapshot>,
  selection: AssistantSelection = {},
) {
  const rendered = { ui: false };
  return Object.freeze({
    rendered,
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
    selectedPayment: async () =>
      selectedPayment(await current(), selection.selectedPaymentId),
    focusedClient: async () =>
      focusedClient(
        await current(),
        selection.focusedClientId,
        selection.focusedInvoiceId,
      ),
    validateUi: async (input: AssistantRenderInput) => {
      const tree = validateUi(await current(), input);
      rendered.ui = true;
      return tree;
    },
  });
}

/**
 * Whether the run that produced `context` validated UI through `render`.
 * `after` in `middleware.ts` decides the assistant's closing message on this.
 */
export function validatedUi(
  context: Readonly<Record<string, unknown>> | undefined,
): boolean {
  const marker = context?.['rendered'];
  return record(marker) && marker['ui'] === true;
}

/**
 * The `render` input an answer written in the response schema stands for:
 * AssistantText prose (joined) plus every other node, unwrapped from its
 * `props`. Malformed nodes pass through for `validateUi` to reject.
 */
function renderInputOf(answer: unknown): AssistantRenderInput | undefined {
  if (!record(answer) || !Array.isArray(answer.ui)) return undefined;
  const texts: string[] = [];
  const components: unknown[] = [];
  const leaf = (node: unknown) => {
    const [name, value] = record(node) ? (Object.entries(node)[0] ?? []) : [];
    components.push(
      name && record(value) && record(value.props)
        ? { [name]: value.props }
        : node,
    );
  };
  for (const node of answer.ui) {
    const text = record(node) ? node.AssistantText : undefined;
    if (!record(text)) {
      leaf(node);
      continue;
    }
    if (record(text.props) && typeof text.props.text === 'string')
      texts.push(text.props.text);
    if (Array.isArray(text.children)) text.children.forEach(leaf);
  }
  return {
    text: texts.join('\n\n'),
    components: components as AssistantRenderInput['components'],
  };
}

/**
 * Validate an answer the model wrote as its final message instead of calling
 * `render`. B4 binds the root model to the client's response schema, so on a
 * follow-up it can answer from earlier tool results in that schema directly.
 * The answer goes through the same `validateUi` as a render call, and the
 * canonical tree comes back as the message to release; `undefined` when the
 * message is not such an answer or the ledger rejects it.
 */
export async function validateFinalAnswer(
  context: Readonly<Record<string, unknown>> | undefined,
  finalMessage: string,
): Promise<string | undefined> {
  const validate = context?.['validateUi'];
  if (typeof validate !== 'function') return undefined;
  let input: AssistantRenderInput | undefined;
  try {
    input = renderInputOf(JSON.parse(finalMessage));
  } catch {
    return undefined;
  }
  if (!input) return undefined;
  try {
    return JSON.stringify(await validate(input));
  } catch {
    return undefined;
  }
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
    const state: Record<string, unknown> = body.state;
    if (
      SELECTION_KEYS.some(
        (key) => state[key] !== undefined && typeof state[key] !== 'string',
      )
    )
      return reject(422);
    const selection: AssistantSelection = Object.fromEntries(
      SELECTION_KEYS.flatMap((key) => {
        const value = state[key];
        return typeof value === 'string' ? [[key, value]] : [];
      }),
    );
    if (selection.focusedInvoiceId && !selection.focusedClientId)
      return reject(422);
    if (Object.keys(selection).length > 0) {
      // A reset between the ownership check and this read is the same stale
      // conversation: reject it rather than throw.
      const ledger = await current().catch(() => undefined);
      if (!ledger) return reject(422);
      if (
        (selection.selectedPaymentId !== undefined &&
          !ledger.payments.some(
            (p) =>
              p.id === selection.selectedPaymentId &&
              (selection.focusedClientId === undefined ||
                p.customerId === selection.focusedClientId),
          )) ||
        (selection.focusedClientId !== undefined &&
          !ledger.customers.some((c) => c.id === selection.focusedClientId)) ||
        (selection.focusedInvoiceId !== undefined &&
          !ledger.invoices.some(
            (i) =>
              i.id === selection.focusedInvoiceId &&
              i.customerId === selection.focusedClientId,
          ))
      )
        return reject(422);
    }
    return {
      action: 'continue' as const,
      context: assistantContext(current, selection),
    };
  };
}
