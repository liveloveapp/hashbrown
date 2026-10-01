import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { localServers } from './local-servers';

const servers = localServers(resolve(import.meta.dirname, '../../..'));

const reachable = (url: string) =>
  fetch(url).then(
    () => true,
    () => false,
  );

/** Poll `url` until it is (or is no longer) reachable, up to `ms`. */
async function until(url: string, up: boolean, ms: number) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if ((await reachable(url)) === up) return up;
    await new Promise((r) => setTimeout(r, 250));
  }
  return !up;
}

const busy = (
  await Promise.all(servers.map((server) => reachable(String(server.url))))
).some(Boolean);

// Playwright starts each webServer command in a shell as its own process
// group, and on teardown kills that group with SIGKILL. A server that leaves
// the group survives teardown as an orphan, and the next run's
// `reuseExistingServer` quietly reuses it.
test.skipIf(busy)(
  'local servers stop when Playwright kills their process group',
  { timeout: 90_000 },
  async () => {
    const started = servers.map((server) =>
      spawn(server.command, {
        cwd: server.cwd,
        shell: true,
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          OPENAI_API_KEY: process.env['OPENAI_API_KEY'] ?? 'not-used',
        },
      }),
    );
    for (const server of servers) await until(String(server.url), true, 45_000);

    for (const child of started) process.kill(-(child.pid ?? 0), 'SIGKILL');
    const stillUp = await Promise.all(
      servers.map((server) => until(String(server.url), false, 5_000)),
    );

    expect(stillUp).toEqual([false, false]);
  },
);
