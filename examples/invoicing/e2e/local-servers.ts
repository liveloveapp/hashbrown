import type { PlaywrightTestConfig } from '@playwright/test';

type WebServer = Extract<
  NonNullable<PlaywrightTestConfig['webServer']>,
  readonly unknown[]
>[number];

/**
 * The agent server (4325) and the React dev server (4326) as Playwright
 * `webServer` entries, for the configs that drive the live model locally.
 *
 * The commands run `tsx` and `vite` directly rather than through
 * `nx serve`. Playwright stops a web server by killing its process group,
 * and Nx starts each command in a session of its own, so servers started
 * through Nx outlived the run as orphans. The next run's
 * `reuseExistingServer` then quietly reused them, and an orphaned agent
 * server crashes on its first log lines (its stdout is a closed socket),
 * mid-way through the first question.
 *
 * @param repoRoot - The repository root; both commands run from there.
 */
export function localServers(repoRoot: string): WebServer[] {
  return [
    {
      command:
        'node_modules/.bin/tsx --tsconfig examples/invoicing/server/tsconfig.json examples/invoicing/server/src/main.ts',
      cwd: repoRoot,
      url: 'http://127.0.0.1:4325/api/snapshot',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command:
        'node_modules/.bin/vite --config examples/invoicing/react/vite.config.mts',
      cwd: repoRoot,
      url: 'http://127.0.0.1:4326',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ];
}
