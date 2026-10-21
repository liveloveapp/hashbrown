import { resolveTransport, type TransportOrFactory } from '../transport';
import type { DevelopmentTransportKind } from './types';

/**
 * Receives the first-time milestones a chat runtime reaches while a
 * development collector observes it.
 */
export interface RuntimeGrowthObserver {
  /**
   * Called once when the observer binds to the runtime.
   *
   * @param transport - Kind of transport the runtime is configured with.
   */
  sessionStarted(transport: DevelopmentTransportKind): void;
  /**
   * Called once, after the first run that streamed text content and finished
   * without an interrupt.
   *
   * @param durationMs - Run duration in milliseconds, when known.
   */
  streamCompleted(durationMs: number | undefined): void;
  /** Called once, after the first tool turn that started and then settled. */
  toolExecuted(): void;
}

/**
 * Connects an observer to one runtime's actions.
 *
 * @param observer - The observer to notify.
 * @returns A function that stops notifying the observer.
 */
export type RuntimeGrowthBinder = (
  observer: RuntimeGrowthObserver,
) => () => void;

const runtimeBinders = new WeakMap<object, RuntimeGrowthBinder>();

/**
 * Registers the binder for a runtime. Registration only stores the binder:
 * nothing is subscribed, scheduled, or sent until an observer binds.
 *
 * @param key - The runtime's unchanged `resume` function.
 * @param binder - The binder that connects observers to the runtime.
 */
export function registerRuntimeBinder(
  key: object,
  binder: RuntimeGrowthBinder,
): void {
  runtimeBinders.set(key, binder);
}

/**
 * Binds an observer to the runtime registered under `key`.
 *
 * @param key - The runtime's unchanged `resume` function.
 * @param observer - The observer to notify.
 * @returns A function that unbinds the observer, or `undefined` when no
 *   runtime is registered under `key`.
 */
export function bindRuntime(
  key: object,
  observer: RuntimeGrowthObserver,
): (() => void) | undefined {
  return runtimeBinders.get(key)?.(observer);
}

/**
 * Classifies a runtime's transport by its name. A missing transport is the
 * default HTTP transport; a factory that throws, or any unrecognised
 * transport, is `custom`.
 *
 * @param provider - The transport or transport factory the runtime stores.
 * @returns The transport kind.
 */
export function classifyTransport(
  provider: TransportOrFactory | undefined,
): DevelopmentTransportKind {
  if (provider === undefined) return 'http';

  let name: string | undefined;
  try {
    name = resolveTransport(provider)?.name;
  } catch {
    return 'custom';
  }

  switch (name) {
    case 'HttpTransport':
      return 'http';
    case 'ExperimentalChromeLocalTransport':
    case 'ExperimentalEdgeLocalTransport':
      return 'local';
    case 'DelegatingLocalPromptTransport':
      return 'delegating';
    default:
      return 'custom';
  }
}
