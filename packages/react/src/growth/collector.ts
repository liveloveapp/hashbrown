import {
  type DevelopmentCollectionDiagnostics,
  ɵcreateDevelopmentCollector,
  type ɵDevelopmentCollector,
  ɵgetDevelopmentCollectionDiagnostics,
  ɵsetDevelopmentCollectionEnabled,
} from '@hashbrownai/core';
import { PACKAGE_VERSION } from '../package-version';

/**
 * Returns true when the application was built for development. A page
 * without `process` (a browser without a bundler) counts as not development,
 * and so does a test runner (`NODE_ENV=test`).
 *
 * @returns Whether `process.env.NODE_ENV` is set to something other than
 * `production` or `test`.
 */
export function isDevelopmentBuild(): boolean {
  try {
    const mode = process.env.NODE_ENV;
    return mode !== 'production' && mode !== 'test';
  } catch {
    return false;
  }
}

/**
 * Creates the development collector a `HashbrownProvider` attaches to each
 * chat runtime its descendant hooks create.
 *
 * @param enabled - Returns false when collection is turned off for the
 * provider.
 * @returns The collector handle.
 */
export function createReactCollector(
  enabled: () => boolean,
): ɵDevelopmentCollector {
  return ɵcreateDevelopmentCollector({
    integration: 'react',
    packageName: '@hashbrownai/react',
    packageVersion: PACKAGE_VERSION,
    isDevelopment: isDevelopmentBuild,
    enabled,
  });
}

/**
 * Turns Hashbrown's development-only collection on or off for the whole page.
 * Turning it off cancels scheduled and in-flight requests and forgets every
 * queued event. See https://hashbrown.dev/docs/react/platform/collection.
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
