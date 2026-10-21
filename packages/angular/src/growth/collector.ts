import {
  inject,
  InjectionToken,
  isDevMode,
  NgZone,
  type Provider,
} from '@angular/core';
import {
  type DevelopmentCollectionDiagnostics,
  ɵcreateDevelopmentCollector,
  type ɵDevelopmentCollector,
  ɵgetDevelopmentCollectionDiagnostics,
  ɵsetDevelopmentCollectionEnabled,
} from '@hashbrownai/core';
import { PACKAGE_VERSION } from '../package-version';
import type { ProvideHashbrownOptions } from '../providers/provide-hashbrown.fn';

/**
 * Holds the function that says whether development collection may run for
 * the resources and components below a `provideHashbrown` call.
 *
 * @internal
 */
export const ɵHASHBROWN_COLLECTION_ENABLED = new InjectionToken<() => boolean>(
  'HashbrownCollectionEnabled',
);

/** Used when no `provideHashbrown` call is in scope. */
const alwaysEnabled = () => true;

/** One collector per enabled function, so one per `provideHashbrown`. */
const collectors = new WeakMap<() => boolean, ɵDevelopmentCollector>();

/**
 * Provides the enabled function for a `provideHashbrown` call. A parent
 * injector's opt-out applies to every nested provider.
 *
 * @internal
 * @param options - The Hashbrown configuration being provided.
 * @returns The provider for {@link ɵHASHBROWN_COLLECTION_ENABLED}.
 */
export function ɵprovideCollectionEnabled(
  options: ProvideHashbrownOptions,
): Provider {
  return {
    provide: ɵHASHBROWN_COLLECTION_ENABLED,
    useFactory: () => {
      const parent = inject(ɵHASHBROWN_COLLECTION_ENABLED, {
        skipSelf: true,
        optional: true,
      });
      return () => (parent?.() ?? true) && options.telemetry !== false;
    },
  };
}

/**
 * Returns the development collector for the current injection context,
 * creating it on first use. Creating a collector has no side effects.
 *
 * @internal
 * @returns The collector shared by everything under the nearest
 * `provideHashbrown`.
 */
export function ɵinjectDevelopmentCollector(): ɵDevelopmentCollector {
  const enabled =
    inject(ɵHASHBROWN_COLLECTION_ENABLED, { optional: true }) ?? alwaysEnabled;
  const zone = inject(NgZone, { optional: true });
  let collector = collectors.get(enabled);
  if (!collector) {
    collector = ɵcreateDevelopmentCollector({
      integration: 'angular',
      packageName: '@hashbrownai/angular',
      packageVersion: PACKAGE_VERSION,
      isDevelopment: isDevMode,
      enabled,
      // Timers and requests stay out of change detection.
      run: (work) => (zone ? zone.runOutsideAngular(work) : work()),
    });
    collectors.set(enabled, collector);
  }
  return collector;
}

/**
 * Turns Hashbrown's development-only collection on or off for the whole page.
 * Turning it off cancels scheduled and in-flight requests and forgets every
 * queued event. See https://hashbrown.dev/docs/angular/platform/collection.
 *
 * @public
 * @param value - Whether collection may run.
 */
export function setDevelopmentCollectionEnabled(value: boolean): void {
  ɵsetDevelopmentCollectionEnabled(value);
}

/**
 * Returns the delivery counters of the page's development collector, useful
 * to confirm what collection has sent.
 *
 * @public
 * @returns The counters, all zero before anything was collected.
 */
export function getDevelopmentCollectionDiagnostics(): DevelopmentCollectionDiagnostics {
  return ɵgetDevelopmentCollectionDiagnostics();
}
