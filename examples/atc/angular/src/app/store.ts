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

/** The current atc state as a signal. Call in an injection context. */
export function injectAtcState(): Signal<AtcState> {
  const store = inject(ATC_STORE);
  const state = signal(store.getState());
  const unsubscribe = store.subscribe(() => state.set(store.getState()));
  inject(DestroyRef).onDestroy(unsubscribe);

  return state.asReadonly();
}
