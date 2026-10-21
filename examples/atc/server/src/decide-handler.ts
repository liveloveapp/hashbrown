import {
  cardGroups,
  CARDS_CONTEXT,
  ROUTE_CONTEXT,
  routeSchema,
} from '@atc/shared';
import { createSelectionSchema, type DecidableSchema } from '@hashbrownai/core';
import { DecisionError, HashbrownTypeSafe } from '@hashbrownai/typesafe';
import {
  BodyTooLargeError,
  type NodeHandler,
  queryParam,
  readJsonBody,
  sendJson,
} from './http';

/** The pinned Jev version; bump it deliberately. */
const DECIDE_MODEL = 'jev-1.14.0';

/** A decision request is a sentence or two; this bounds what is forwarded. */
const MAX_REQUEST_CHARS = 4000;

/** The most body bytes read: the browser also sends questions, which are ignored. */
const MAX_BODY_BYTES = 16 * 1024;

/** The questions and context each `kind` is pinned to. */
const KINDS: Record<string, { schema: DecidableSchema; system: string }> = {
  route: { schema: routeSchema, system: ROUTE_CONTEXT },
  cards: {
    schema: createSelectionSchema(cardGroups, { max: 2 }),
    system: CARDS_CONTEXT,
  },
};

/** Options for {@link createDecideHandler}. */
export interface DecideHandlerOptions {
  /** A `fetch` for the TypeSafe call; tests pass a fake. */
  fetch?: typeof fetch;
}

/**
 * The text to decide about, from the state the browser sends: `state.input`
 * when it is a `{ system, input }` object, or the state itself when it is a
 * string. Anything else is undefined.
 */
function inputOf(state: unknown): unknown {
  if (typeof state === 'string') {
    return state;
  }
  if (typeof state === 'object' && state !== null && !Array.isArray(state)) {
    const input = (state as Record<string, unknown>)['input'];

    return typeof input === 'string' ? input : undefined;
  }

  return undefined;
}

/**
 * `/api/decide?kind=route|cards`: answers a Hashbrown decision with
 * TypeSafe's Jev model.
 *
 * A public endpoint: the questions (built from the pinned schema for the
 * `kind`), the context and the model are fixed here. Only the user's text,
 * from `state.input`, comes from the client; its `questions` and `system`
 * are ignored. Without `TYPESAFE_API_KEY` it answers 503 `{ code:
 * 'unavailable' }`, and the browser falls back to its no-decision path.
 *
 * @param env - The environment; reads `TYPESAFE_API_KEY`.
 * @param options - Test seams.
 * @returns The route handler.
 */
export function createDecideHandler(
  env: NodeJS.ProcessEnv,
  options: DecideHandlerOptions = {},
): NodeHandler {
  return async (req, res) => {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { code: 'method_not_allowed' });
    }
    const apiKey = env['TYPESAFE_API_KEY'];
    if (!apiKey) {
      return sendJson(res, 503, { code: 'unavailable' });
    }
    const kind = queryParam(req, 'kind');
    const pinned = Object.hasOwn(KINDS, kind) ? KINDS[kind] : undefined;
    if (pinned === undefined) {
      return sendJson(res, 400, { code: 'invalid_request' });
    }
    let body: unknown;
    try {
      body = await readJsonBody(req, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return sendJson(
          res,
          413,
          { code: 'too_large' },
          { Connection: 'close' },
        );
      }

      return sendJson(res, 400, { code: 'invalid_request' });
    }
    const input = inputOf(
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)['state']
        : undefined,
    );
    if (input === undefined) {
      return sendJson(res, 400, { code: 'invalid_request' });
    }
    const request = { state: { system: pinned.system, input } };
    if (JSON.stringify(request).length > MAX_REQUEST_CHARS) {
      return sendJson(res, 413, { code: 'too_large' });
    }
    const abortController = new AbortController();
    res.once('close', () => abortController.abort());
    try {
      const decision = await HashbrownTypeSafe.decide({
        apiKey,
        model: DECIDE_MODEL,
        schema: pinned.schema,
        request,
        maxRequestChars: MAX_REQUEST_CHARS,
        signal: abortController.signal,
        fetch: options.fetch,
      });

      return sendJson(res, 200, decision);
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      if (error instanceof DecisionError) {
        return sendJson(res, error.status, { code: error.code });
      }
      console.error('[atc] decide failed', error);

      return sendJson(res, 500, { code: 'internal' });
    }
  };
}
