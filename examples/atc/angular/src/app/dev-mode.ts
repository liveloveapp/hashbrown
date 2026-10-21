import {
  browserStorage,
  type DevRow,
  type DevStorage,
  readDevMode,
  recordRoute,
  type RouteSend,
  type TurnShown,
  TYPING_EMPTY,
  type TypingShown,
  writeDevMode,
} from '@atc/shared';
import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  InjectionToken,
  type Signal,
  signal,
} from '@angular/core';

/** Where dev mode and the drawer height are remembered; tests provide one. */
export const DEV_STORAGE = new InjectionToken<DevStorage | null>(
  'atc dev storage',
  { providedIn: 'root', factory: () => browserStorage() },
);

/** The chat as the drawer reads it: the transcript rows and recorded sends. */
export interface DevChat {
  readonly items: readonly DevRow[];
  readonly turns: readonly TurnShown[];
  readonly busy: boolean;
}

/** What the chat publishes for the drawer. */
export interface DevFeed {
  /** What the router makes of the text being typed. */
  readonly typing: TypingShown;
  readonly chat: DevChat;
}

const EMPTY_FEED: DevFeed = {
  typing: TYPING_EMPTY,
  chat: { items: [], turns: [], busy: false },
};

type FeedSources = { readonly [K in keyof DevFeed]?: Signal<DevFeed[K]> };

/**
 * Dev mode, as the rail, the header, the transcript and the drawer see it:
 * off for a first visit, then remembered in {@link DEV_STORAGE}; and what the
 * chat publishes for it ({@link publishDev}).
 */
@Injectable({ providedIn: 'root' })
export class DevMode {
  /** Where dev mode and the drawer height are remembered. */
  readonly storage = inject(DEV_STORAGE);
  private readonly state = signal(readDevMode(this.storage));
  private readonly sources = signal<FeedSources>({});
  private readonly logged = signal<readonly RouteSend[]>([]);
  /** True while the developer drawer is open. */
  readonly on = this.state.asReadonly();
  /** Every submission and its route, newest first (see {@link recordRoute}). */
  readonly routes = this.logged.asReadonly();
  /** What the router makes of the text being typed. */
  readonly typing = computed(
    () => this.sources().typing?.() ?? EMPTY_FEED.typing,
  );
  /** The chat, as the assistant published it. */
  readonly chat = computed(() => this.sources().chat?.() ?? EMPTY_FEED.chat);

  /** Opens or closes the drawer, and remembers it. */
  toggle(): void {
    const on = !this.state();
    writeDevMode(this.storage, on);
    this.state.set(on);
  }

  /**
   * Logs a submission and the route it took for the drawer's Router tab. It
   * logs whether or not dev mode is on (the log is capped), so the drawer
   * shows recent sends when opened later.
   */
  recordRoute(send: RouteSend): void {
    this.logged.update((log) => recordRoute(log, send));
  }

  /** Feeds `key` from `source` until the returned function is called. */
  publish<K extends keyof DevFeed>(
    key: K,
    source: Signal<DevFeed[K]>,
  ): () => void {
    this.sources.update((sources) => ({ ...sources, [key]: source }));

    return () =>
      this.sources.update((sources) => {
        if (sources[key] !== source) return sources;
        const rest = { ...sources };
        delete rest[key];

        return rest;
      });
  }
}

/**
 * Publishes `source` as the feed's `key` for the drawer, until the caller is
 * destroyed. Only the drawer reads the feed, so publishing never re-renders
 * the publisher. Call in an injection context.
 */
export function publishDev<K extends keyof DevFeed>(
  key: K,
  source: Signal<DevFeed[K]>,
): void {
  const stop = inject(DevMode).publish(key, source);
  // A destroyed publisher leaves nothing stale behind.
  inject(DestroyRef).onDestroy(stop);
}
