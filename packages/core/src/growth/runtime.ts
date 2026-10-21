/* eslint-disable @nx/enforce-module-boundaries -- `#development-install` is a package.json import kept external by the bundler so the postinstall token resolves at install time; a relative import would inline the null default. */
import { installationToken } from '#development-install';
import type { ResumeOptions } from '../models/interrupt';
import { DevelopmentCollector as CollectorQueue } from './collector';
import { bindRuntime } from './runtime-binding';
import {
  type DevelopmentCollectionDiagnostics,
  type DevelopmentCollector,
  type DevelopmentCollectorOptions,
  type DevelopmentMilestone,
  type DevelopmentTransportKind,
  type RuntimeOwner,
  UUID,
  VERSION,
} from './types';

type MilestoneDetail = {
  transport?: DevelopmentTransportKind;
  durationMs?: number;
};

type Reporter = (kind: DevelopmentMilestone, detail?: MilestoneDetail) => void;

const ZERO: DevelopmentCollectionDiagnostics = {
  acknowledged: 0,
  failures: 0,
  discarded: 0,
  pending: 0,
};

const reporters = new WeakMap<DevelopmentCollector, Reporter>();

let enabled = true;
let shared: CollectorQueue | undefined;

/** Returns the shared queue, creating it on first use. */
function queue(): CollectorQueue {
  shared ??= new CollectorQueue();
  return shared;
}

/**
 * Returns true when the page is a real, interactive browser that has not opted
 * out and offers the APIs the collector needs.
 */
function browserAllowed(): boolean {
  if (!enabled) return false;
  if (typeof window === 'undefined' || typeof document === 'undefined')
    return false;
  if (typeof navigator !== 'undefined' && navigator.webdriver === true)
    return false;
  const page = window as unknown as {
    __HASHBROWN_TELEMETRY_DISABLED__?: unknown;
  };
  if (page.__HASHBROWN_TELEMETRY_DISABLED__ === true) return false;
  try {
    if (window.localStorage.getItem('HASHBROWN_TELEMETRY_DISABLED') === '1')
      return false;
  } catch {
    // Blocked storage cannot carry an opt-out; the other checks still apply.
  }
  return (
    typeof window.crypto?.randomUUID === 'function' &&
    typeof globalThis.fetch === 'function'
  );
}

function valid(options: DevelopmentCollectorOptions): boolean {
  return (
    (options.integration === 'react' || options.integration === 'angular') &&
    options.packageName === `@hashbrownai/${options.integration}` &&
    typeof options.packageVersion === 'string' &&
    VERSION.test(options.packageVersion) &&
    typeof options.isDevelopment === 'function' &&
    (options.enabled === undefined || typeof options.enabled === 'function')
  );
}

function noop(): void {
  // Nothing to undo.
}

/**
 * Creates the development collector a framework package attaches to each
 * chat runtime it creates. The collector only reports while the application
 * is a development build in an interactive browser that has not opted out;
 * otherwise every call is a no-op. Nothing is scheduled or sent at creation,
 * and no call ever throws into the application.
 *
 * @param options - The framework package's identity and development checks.
 * @returns The collector handle.
 */
export function createDevelopmentCollector(
  options: DevelopmentCollectorOptions,
): DevelopmentCollector {
  let disposed = false;
  let lastTransport: DevelopmentTransportKind | undefined;
  const bindings = new Set<() => void>();
  let accepted = false;
  try {
    accepted = valid(options);
  } catch {
    accepted = false;
  }
  const ownerOptions = {
    ...options,
    installationToken:
      typeof installationToken === 'string' && UUID.test(installationToken)
        ? installationToken
        : null,
  };
  const allowed = (): boolean => {
    try {
      return (
        accepted &&
        !disposed &&
        (options.enabled?.() ?? true) &&
        options.isDevelopment() &&
        browserAllowed()
      );
    } catch {
      return false;
    }
  };
  const owner = (transport?: DevelopmentTransportKind): RuntimeOwner => ({
    options: ownerOptions,
    allowed,
    transport: () => transport ?? lastTransport ?? 'http',
  });
  const touch = (
    runtimeOwner: RuntimeOwner,
    kind?: DevelopmentMilestone,
    durationMs?: number,
  ) => {
    try {
      if (runtimeOwner.allowed()) queue().touch(runtimeOwner, kind, durationMs);
      else shared?.prune();
    } catch {
      // Collection must never affect the application.
    }
  };

  const collector: DevelopmentCollector = {
    attach(runtime: { readonly resume: (options: ResumeOptions) => void }) {
      try {
        if (disposed || !accepted) return noop;
        const detach = bindRuntime(runtime.resume, {
          sessionStarted(transport) {
            lastTransport = transport;
            touch(owner());
          },
          streamCompleted(durationMs) {
            touch(owner(), 'runtime.first_stream_completed', durationMs);
          },
          toolExecuted() {
            touch(owner(), 'tool.first_call_executed');
          },
        });
        if (!detach) return noop;
        bindings.add(detach);
        return () => {
          try {
            if (bindings.delete(detach)) detach();
          } catch {
            // Collection must never affect the application.
          }
        };
      } catch {
        return noop;
      }
    },
    dispose() {
      try {
        disposed = true;
        const detaches = [...bindings];
        bindings.clear();
        detaches.forEach((detach) => detach());
        shared?.prune();
      } catch {
        // Collection must never affect the application.
      }
    },
  };
  reporters.set(collector, (kind, detail) =>
    touch(owner(detail?.transport), kind, detail?.durationMs),
  );
  return collector;
}

/**
 * Reports a first-time milestone for a collector, such as the first generated
 * component a framework package rendered. Milestones are reported at most
 * once per session; calls while collection is not allowed do nothing.
 *
 * @param collector - A collector from `createDevelopmentCollector`.
 * @param kind - The milestone reached.
 * @param detail - Optional `transport` to report instead of the one the
 * runtime was bound with, and `durationMs` of the first stream.
 */
export function reportMilestone(
  collector: DevelopmentCollector,
  kind: DevelopmentMilestone,
  detail?: { transport?: DevelopmentTransportKind; durationMs?: number },
): void {
  try {
    reporters.get(collector)?.(kind, detail);
  } catch {
    // Collection must never affect the application.
  }
}

/**
 * Turns development collection on or off for the page. Turning it off cancels
 * scheduled and in-flight requests and forgets every queued event; turning it
 * back on lets later activity create a fresh queue.
 *
 * @param value - Whether collection may run.
 */
export function setDevelopmentCollectionEnabled(value: boolean): void {
  try {
    enabled = value;
    if (!value) {
      shared?.clear();
      shared = undefined;
    }
  } catch {
    // Collection must never affect the application.
  }
}

/**
 * Returns the delivery counters of the page's development collector.
 *
 * @returns The counters, all zero before anything was collected.
 */
export function getDevelopmentCollectionDiagnostics(): DevelopmentCollectionDiagnostics {
  try {
    return shared?.diagnostics() ?? { ...ZERO };
  } catch {
    return { ...ZERO };
  }
}
