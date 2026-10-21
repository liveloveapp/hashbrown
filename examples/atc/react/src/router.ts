import {
  createRouterInput,
  ROUTE_CONTEXT,
  type RouteAction,
  type RouteBadge,
  ROUTER_WAIT_MS,
  routerBadge,
  routeSchema,
  submitTarget,
  trackDecisionInput,
} from '@atc/shared';
import { createHttpDecisionTransport, type Decision } from '@hashbrownai/core';
import { useDecision } from '@hashbrownai/react';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

// 4. Decide: route what the user typed. One closed question, answered with a
//    probability, says whether the text changes the map or asks the assistant.
//    The server pins the questions (server/src/decide-handler.ts).

const ROUTE_TRANSPORT = createHttpDecisionTransport({
  url: '/api/decide?kind=route',
});
const ROUTER = createRouterInput();

/** The composer's router: the badge for the typed text, and what Enter does. */
export interface Router {
  /** Where the typed text would go, for the badge. */
  readonly badge: RouteBadge;
  /**
   * Resolves where Enter sends the text now. Waits up to a second for the
   * router to answer for the current text, then goes to chat. Resolves null
   * when {@link Router.cancel} is called (the user typed again) or a newer
   * submit replaced this one.
   */
  submit(): Promise<RouteAction | null>;
  /** Drops a submission that is still waiting. */
  cancel(): void;
}

/**
 * Routes `draft` with a decision: `useDecision` against
 * `/api/decide?kind=route`, debounced by 150 ms. `transport` replaces the HTTP
 * transport (tests). A failed decision, such as the 503 without a key, is a
 * plain chat route.
 */
export function useRouter(
  draft: string,
  options: { transport?: Decision.Transport } = {},
): Router {
  const text = draft.trim();
  const tracked = useMemo(
    () => trackDecisionInput(options.transport ?? ROUTE_TRANSPORT),
    [options.transport],
  );
  const decision = useDecision({
    schema: routeSchema,
    input: text === '' ? null : text,
    system: ROUTE_CONTEXT,
    debounceTime: 150,
    transport: tracked.transport,
  });
  const [state, dispatch] = useReducer(ROUTER.reduce, ROUTER.initial);
  // React allows updating this component's own state while it renders, to
  // follow a changed input; the reducer returns the same state for same text.
  if (state.text !== text) {
    dispatch({ type: 'typed', text });
  }

  const { value, meta, error, isLoading } = decision;
  useEffect(() => {
    const answeredFor = tracked.answeredFor();
    if (isLoading || answeredFor === null) {
      return;
    }
    if (error) {
      dispatch({ type: 'failed', text: answeredFor });
    } else if (value && meta) {
      dispatch({
        type: 'decided',
        text: answeredFor,
        result: { value, meta },
      });
    }
  }, [tracked, value, meta, error, isLoading]);

  // What a waiting Enter re-checks when the state changes.
  const latest = useRef(state);
  const listeners = useRef(new Set<() => void>());
  const cancelWaiting = useRef<() => void>(() => undefined);
  useEffect(() => {
    latest.current = state;
    listeners.current.forEach((listener) => listener());
  }, [state]);

  const submit = useCallback(() => {
    cancelWaiting.current();
    const started = Date.now();

    return new Promise<RouteAction | null>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (action: RouteAction | null) => {
        clearTimeout(timer);
        listeners.current.delete(check);
        cancelWaiting.current = () => undefined;
        resolve(action);
      };
      const check = () => {
        const waited = Date.now() - started;
        const target = submitTarget(latest.current, waited);
        if (target !== 'wait') {
          finish(target);
        } else {
          clearTimeout(timer);
          timer = setTimeout(check, Math.max(0, ROUTER_WAIT_MS - waited));
        }
      };
      cancelWaiting.current = () => finish(null);
      listeners.current.add(check);
      check();
    });
  }, []);
  // Nothing fires after unmount: a waiting Enter is dropped with its timer.
  useEffect(() => () => cancelWaiting.current(), []);
  const cancel = useCallback(() => cancelWaiting.current(), []);

  return { badge: routerBadge(state), submit, cancel };
}
