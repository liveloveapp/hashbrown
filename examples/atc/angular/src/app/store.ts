import { type AtcState, type AtcStore, createAtcStore } from '@atc/shared';
import {
  DestroyRef,
  inject,
  InjectionToken,
  type Signal,
  signal,
} from '@angular/core';

/** The app-wide atc store. */
export const ATC_STORE = new InjectionToken<AtcStore>('ATC_STORE', {
  providedIn: 'root',
  factory: () => createAtcStore(),
});

/**
 * The current atc state as one app-wide signal: a single store subscription
 * that every component reads, as React's `useSyncExternalStore` does.
 */
export const ATC_STATE = new InjectionToken<Signal<AtcState>>('ATC_STATE', {
  providedIn: 'root',
  factory: () => {
    const store = inject(ATC_STORE);
    const state = signal(store.getState());
    inject(DestroyRef).onDestroy(
      store.subscribe(() => state.set(store.getState())),
    );

    return state.asReadonly();
  },
});

/** The current atc state as a signal. Call in an injection context. */
export function injectAtcState(): Signal<AtcState> {
  return inject(ATC_STATE);
}
