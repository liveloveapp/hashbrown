import type { AtcState, AtcStore } from '@atc/shared';
import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';

const AtcStoreContext = createContext<AtcStore | null>(null);

/** Provides the atc store to the map, the tools and the components. */
export function AtcStoreProvider({ store, children }: { store: AtcStore; children: ReactNode }) {
  return <AtcStoreContext.Provider value={store}>{children}</AtcStoreContext.Provider>;
}

/** The atc store. Throws outside {@link AtcStoreProvider}. */
export function useAtcStore(): AtcStore {
  const store = useContext(AtcStoreContext);
  if (store === null) {
    throw new Error('useAtcStore must be used inside AtcStoreProvider');
  }

  return store;
}

/** The current atc state; re-renders on every store change. */
export function useAtcState(): AtcState {
  const store = useAtcStore();

  return useSyncExternalStore(store.subscribe, store.getState);
}
