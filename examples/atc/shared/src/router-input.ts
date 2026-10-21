import type { Decision } from '@hashbrownai/core';
import type { routeSchema } from './contracts';
import {
  routeAction,
  type RouteAction,
  routeBadge,
  type RouteBadge,
} from './route';

type RouteResult = Decision.Result<typeof routeSchema>;

/** How long Enter waits for the router to answer for the current text. */
export const ROUTER_WAIT_MS = 1000;

/** What the composer knows about the text and the router's answer for it. */
export interface RouterInputState {
  /** The trimmed text in the composer. */
  readonly text: string;
  /** The text the latest answer (or failure) was for, or null before one. */
  readonly decidedFor: string | null;
  /** The latest decision, kept while a newer one is pending. */
  readonly result: RouteResult | null;
  /** True while no answer for {@link RouterInputState.text} has arrived. */
  readonly pending: boolean;
  /** True when the latest decision failed (no key, offline); it routes to chat. */
  readonly failed: boolean;
}

/** An event the composer feeds the router: typing, an answer, or a failure. */
export type RouterInputEvent =
  | { readonly type: 'typed'; readonly text: string }
  | {
      readonly type: 'decided';
      readonly text: string;
      readonly result: RouteResult;
    }
  | { readonly type: 'failed'; readonly text: string };

/** The router's starting state and its pure reducer. */
export interface RouterInput {
  readonly initial: RouterInputState;
  reduce(state: RouterInputState, event: RouterInputEvent): RouterInputState;
}

const INITIAL: RouterInputState = {
  text: '',
  decidedFor: null,
  result: null,
  pending: false,
  failed: false,
};

function reduce(
  state: RouterInputState,
  event: RouterInputEvent,
): RouterInputState {
  const text = event.text.trim();
  if (event.type === 'typed') {
    if (text === '') return INITIAL;
    if (text === state.text) return state;

    return { ...state, text, pending: state.decidedFor !== text };
  }
  // An answer for text that is no longer in the composer is dropped.
  if (text !== state.text) return state;
  if (event.type === 'decided') {
    return {
      text,
      decidedFor: text,
      result: event.result,
      pending: false,
      failed: false,
    };
  }

  return { text, decidedFor: text, result: null, pending: false, failed: true };
}

/**
 * The composer's routing state machine, as a pure reducer. Feed it `typed`
 * with every change, then `decided` or `failed` with the text each answer was
 * for; an answer for older text never counts for the current text.
 */
export function createRouterInput(): RouterInput {
  return { initial: INITIAL, reduce };
}

/**
 * What Enter does now. `'wait'` until the answer belongs to the current text
 * or `waitedMs` reaches {@link ROUTER_WAIT_MS}; then the route, or chat when
 * the decision failed or never came.
 */
export function submitTarget(
  state: RouterInputState,
  waitedMs: number,
): 'wait' | RouteAction {
  if (state.text !== '' && state.decidedFor === state.text) {
    return state.failed ? { kind: 'chat' } : routeAction(state.result);
  }

  return waitedMs >= ROUTER_WAIT_MS ? { kind: 'chat' } : 'wait';
}

/** The badge for the router's state: the latest answer, or `→ chat` after a failure. */
export function routerBadge(state: RouterInputState): RouteBadge {
  return routeBadge(state.result, state.pending, state.failed);
}

/** A decision transport that reports which text each answer was for. */
export interface TrackedDecisionTransport {
  /** Wraps the transport it was given. */
  readonly transport: Decision.Transport;
  /** The text of the latest request that was answered or failed, or null. */
  answeredFor(): string | null;
  /** How many milliseconds the latest answered or failed request took. */
  answeredMs(): number | null;
}

function inputText(state: Decision.Request['state']): string | null {
  if (typeof state === 'string') return state;
  if (typeof state === 'object' && state !== null && !Array.isArray(state)) {
    const input = (state as Record<string, unknown>)['input'];

    return typeof input === 'string' ? input : null;
  }

  return null;
}

/**
 * Wraps a decision transport so the apps can tell which text a result or an
 * error is for: Hashbrown keeps the last value while a new request runs, so
 * the value alone does not say. A request the browser aborted is not recorded.
 */
export function trackDecisionInput(
  transport: Decision.Transport,
): TrackedDecisionTransport {
  let answered: string | null = null;
  let answeredMs: number | null = null;

  return {
    transport: async (request, signal) => {
      const started = Date.now();
      const record = () => {
        if (signal.aborted) return;
        answered = inputText(request.state);
        answeredMs = Date.now() - started;
      };
      try {
        const response = await transport(request, signal);
        record();

        return response;
      } catch (error) {
        record();
        throw error;
      }
    },
    answeredFor: () => answered,
    answeredMs: () => answeredMs,
  };
}
