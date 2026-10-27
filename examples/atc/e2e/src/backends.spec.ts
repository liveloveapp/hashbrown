import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { PROMPTS } from './model';
import { stubAtcFeeds } from './stubs';
import { frame, scenario } from './traffic-fixtures';

for (const backend of ['openai', 'b4run'] as const) {
  test(`${backend}: browser query, map action and pinned card survive continuations and reload`, async ({
    page,
  }, info) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        resolve(__dirname, 'fixtures/backend-server.cts'),
        backend,
      ],
      {
        cwd: resolve(__dirname, '../../../..'),
        env: {
          ...process.env,
          TSX_TSCONFIG_PATH: resolve(__dirname, '../tsconfig.json'),
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      output += String(chunk);
    });
    const ready = await Promise.race([
      once(child, 'message').then(([message]) => message as { origin: string }),
      once(child, 'exit').then(() => {
        throw new Error(`Backend server failed: ${output}`);
      }),
    ]);
    const origin = ready.origin;
    const requests: {
      threadId: string;
      forwardedProps: { hashbrown: { responseSchema: unknown } };
    }[] = [];
    const errors: string[] = [];
    let conflictsLeft = backend === 'b4run' ? 2 : 0;
    let retryAfter = '1';
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().endsWith('/api/run'))
        requests.push(request.postDataJSON());
    });
    try {
      await stubAtcFeeds(page, { frames: frame, blockTiles: true });
      if (backend === 'b4run') {
        await page.route('**/api/run', (route) => {
          if (conflictsLeft-- > 0) {
            return route.fulfill({
              status: 409,
              headers: {
                'content-type': 'application/json',
                'retry-after': retryAfter,
              },
              body: JSON.stringify({
                error: {
                  kind: 'request_error',
                  details: { code: 'run_in_flight' },
                },
              }),
            });
          }
          return route.continue();
        });
      }
      await page.goto(`${origin}/${info.project.name}/`);
      await expect(page.getByTestId('airspace-map')).toHaveAttribute(
        'data-ready',
        '',
      );
      await page
        .getByRole('textbox', { name: 'Message' })
        .fill(PROMPTS.reasoned);
      await page.getByRole('button', { name: 'Send', exact: true }).click();

      await expect(
        page.locator(
          `[data-testid="flight-card"][data-hex="${scenario.highest.hex}"]`,
        ),
      ).toBeVisible();
      await expect(
        page.locator(`.atc-plane[data-hex="${scenario.highest.hex}"]`),
      ).toHaveClass(/is-highlighted/);
      const initialRequests = backend === 'b4run' ? 5 : 3;
      expect(requests).toHaveLength(initialRequests);
      if (backend === 'b4run') {
        expect(requests[1]).toEqual(requests[0]);
        expect(requests[2]).toEqual(requests[0]);
        await expect(page.getByRole('alert')).toHaveCount(0);
      }
      expect(new Set(requests.map(({ threadId }) => threadId)).size).toBe(1);
      requests.forEach(({ forwardedProps }) =>
        expect(forwardedProps.hashbrown.responseSchema).toEqual(
          requests[0].forwardedProps.hashbrown.responseSchema,
        ),
      );
      expect(
        JSON.stringify(requests[0].forwardedProps.hashbrown.responseSchema),
      ).not.toContain('ArrivalsBoard');
      expect(errors).toEqual([]);
      const firstThread = requests[0].threadId;

      if (backend === 'b4run') {
        conflictsLeft = 1;
        retryAfter = '61';
      }
      await page.reload();
      await expect(page.getByTestId('flight-card')).toHaveCount(0);
      await page
        .getByRole('textbox', { name: 'Message' })
        .fill(PROMPTS.reasoned);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      if (backend === 'b4run') {
        await expect(page.getByRole('alert')).toBeVisible();
        expect(requests).toHaveLength(initialRequests + 1);
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
      }
      await expect(page.getByTestId('flight-card')).toBeVisible();
      expect(requests[initialRequests].threadId).not.toBe(firstThread);

      if (backend === 'b4run') {
        await page.reload();
        await expect(page.getByTestId('airspace-map')).toHaveAttribute(
          'data-ready',
          '',
        );
        conflictsLeft = 60;
        retryAfter = '1';
        const beforeWaiting = requests.length;
        await page
          .getByRole('textbox', { name: 'Message' })
          .fill(PROMPTS.reasoned);
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        await expect.poll(() => requests.length).toBeGreaterThan(beforeWaiting);
        await expect(
          page.getByRole('button', { name: 'Send', exact: true }),
        ).toBeDisabled();
        const retiredThread = requests.at(-1)?.threadId;
        await page.reload();
        await expect(page.getByTestId('airspace-map')).toHaveAttribute(
          'data-ready',
          '',
        );
        const retiredRequests = requests.filter(
          (r) => r.threadId === retiredThread,
        ).length;
        // Observe more than one server-requested interval after the old document is retired.
        await page.waitForTimeout(1500);
        expect(
          requests.filter((r) => r.threadId === retiredThread),
        ).toHaveLength(retiredRequests);
        await expect(page.getByTestId('flight-card')).toHaveCount(0);
        conflictsLeft = 0;
        await page
          .getByRole('textbox', { name: 'Message' })
          .fill(PROMPTS.reasoned);
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        await expect(page.getByTestId('flight-card')).toBeVisible();
        expect(requests.at(-1)?.threadId).not.toBe(retiredThread);
        expect(errors).toEqual([]);
      }
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });
}
