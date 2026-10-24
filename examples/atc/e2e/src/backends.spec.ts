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
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().endsWith('/api/run'))
        requests.push(request.postDataJSON());
    });
    try {
      await stubAtcFeeds(page, { frames: frame, blockTiles: true });
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
      expect(requests).toHaveLength(3);
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

      await page.reload();
      await expect(page.getByTestId('flight-card')).toHaveCount(0);
      await page
        .getByRole('textbox', { name: 'Message' })
        .fill(PROMPTS.reasoned);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.getByTestId('flight-card')).toBeVisible();
      expect(requests[3].threadId).not.toBe(firstThread);
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });
}
