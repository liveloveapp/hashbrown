import {
  createRouterInput,
  ROUTE_CONTEXT,
  type RouteAction,
  type RouteBadge,
  ROUTER_WAIT_MS,
  routerBadge,
  type RouterInputState,
  routeSchema,
  submitTarget,
  trackDecisionInput,
} from '@atc/shared';
import {
  computed,
  effect,
  inject,
  InjectionToken,
  linkedSignal,
  type Signal,
  untracked,
} from '@angular/core';
import { decisionResource } from '@hashbrownai/angular';
import { createHttpDecisionTransport, type Decision } from '@hashbrownai/core';

// 4. Decide: route what the user typed. One closed question, answered with a
//    probability, says whether the text changes the map or asks the assistant.
//    The server pins the questions (server/src/decide-handler.ts).

/** The transport the router asks; tests provide a fake. */
export const ROUTE_DECISION_TRANSPORT = new InjectionToken<Decision.Transport>(
  'atc route decision transport',
  {
    providedIn: 'root',
    factory: () =>
      createHttpDecisionTransport({ url: '/api/decide?kind=route' }),
  },
);

const ROUTER = createRouterInput();

/** The composer's router: the badge for the typed text, and what Enter does. */
export interface Router {
  /** Where the typed text would go, for the badge. */
  readonly badge: Signal<RouteBadge>;
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
 * Routes `draft` with a decision: `decisionResource` against
 * `/api/decide?kind=route`, debounced by 150 ms. A failed decision, such as
 * the 503 without a key, is a plain chat route. Call in an injection context.
 */
export function injectRouter(draft: Signal<string>): Router {
  const text = computed(() => draft().trim());
  const tracked = trackDecisionInput(inject(ROUTE_DECISION_TRANSPORT));
  const decision = decisionResource({
    schema: routeSchema,
    input: computed(() => (text() === '' ? null : text())),
    system: ROUTE_CONTEXT,
    debounce: 150,
    transport: tracked.transport,
  });
  // Follows the typed text; the effect below adds each answer to it.
  const state = linkedSignal<string, RouterInputState>({
    source: text,
    computation: (current, previous) =>
      ROUTER.reduce(previous?.value ?? ROUTER.initial, {
        type: 'typed',
        text: current,
      }),
  });

  effect(() => {
    const value = decision.value();
    const meta = decision.meta();
    const error = decision.error();
    const loading = decision.isLoading();
    untracked(() => {
      const answeredFor = tracked.answeredFor();
      if (loading || answeredFor === null) {
        return;
      }
      if (error) {
        state.update((current) =>
          ROUTER.reduce(current, { type: 'failed', text: answeredFor }),
        );
      } else if (value && meta) {
        state.update((current) =>
          ROUTER.reduce(current, {
            type: 'decided',
            text: answeredFor,
            result: { value, meta },
          }),
        );
      }
    });
  });

  // What a waiting Enter re-checks when the state changes.
  const listeners = new Set<() => void>();
  let cancelWaiting: () => void = () => undefined;
  effect(() => {
    state();
    untracked(() => listeners.forEach((listener) => listener()));
  });

  return {
    badge: computed(() => routerBadge(state())),
    submit() {
      cancelWaiting();
      const started = Date.now();

      return new Promise<RouteAction | null>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (action: RouteAction | null) => {
          clearTimeout(timer);
          listeners.delete(check);
          cancelWaiting = () => undefined;
          resolve(action);
        };
        const check = () => {
          const waited = Date.now() - started;
          const target = submitTarget(untracked(state), waited);
          if (target !== 'wait') {
            finish(target);
          } else {
            clearTimeout(timer);
            timer = setTimeout(check, Math.max(0, ROUTER_WAIT_MS - waited));
          }
        };
        cancelWaiting = () => finish(null);
        listeners.add(check);
        check();
      });
    },
    cancel: () => cancelWaiting(),
  };
}
