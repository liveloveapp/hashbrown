import { expect, test } from '@playwright/test';
import { LLMock } from '@copilotkit/aimock';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApi } from './fixtures/node-route';
import type { HashbrownRunInput } from '../conformance/harness/agui';

for (const toolRound of [false, true]) {
  test(`${toolRound ? 'selects a payment and continues' : 'renders trusted UI'} through the canonical native-provider server and OpenAI adapter`, async ({
    page,
  }, testInfo) => {
    const angular = testInfo.project.name === 'angular';
    const content = {
      ui: [
        {
          status: {
            props: {
              title: 'Example fixture rendered successfully.',
              count: 1,
            },
          },
        },
      ],
    };
    const mock = new LLMock({ port: 0 });
    let release = () => undefined as void;
    const continuation = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (toolRound) {
      mock.onToolResult('sample-control', async () => {
        await continuation;
        return { content: JSON.stringify(content) };
      });
      mock.onMessage('Verify the example transport', {
        toolCalls: [
          {
            id: 'sample-control',
            name: 'selectPayment',
            arguments: { paymentId: 'payment-northstar-exact' },
          },
        ],
      });
    } else {
      mock.onMessage('Verify the example transport', { content });
    }
    await mock.start();
    let server: Server | undefined;
    const requests: HashbrownRunInput[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    try {
      server = createApi({
        apiKey: 'fixture-only',
        baseURL: `${mock.url}/v1`,
        model: 'gpt-4.1-mini',
      }).listen(0, '127.0.0.1');
      await once(server, 'listening');
      const { port } = server.address() as AddressInfo;
      // Route only the destination; the browser consumes the sample's real SSE response.
      await page.route('**/api/chat', async (route) => {
        requests.push(route.request().postDataJSON());
        await route.continue({ url: `http://127.0.0.1:${port}/api/chat` });
      });
      await page.goto(
        '/?scenario=ui&native=true&runUrl=' +
          encodeURIComponent('http://127.0.0.1:' + port + '/api/chat'),
      );
      if (!angular)
        await expect(page.getByTestId('selection-grid')).toHaveCSS(
          'display',
          'grid',
        );
      await page.getByTestId('prompt').fill('Verify the example transport');
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/chat') &&
          response.request().method() === 'POST',
      );

      await page.getByRole('button', { name: 'Send', exact: true }).click();
      const response = await responsePromise;
      if (toolRound) {
        await expect.poll(() => requests.length).toBe(2);
        await expect(page.getByTestId('selected-payment')).toHaveText(
          'payment-northstar-exact',
        );
        await expect(page.getByTestId('tool-count')).toHaveText('1');
        await expect(page.getByTestId('status-card')).toHaveCount(0);
        release();
      }
      await expect(page.getByTestId('status-card')).toBeVisible();
      if (angular) {
        await expect(page.getByTestId('native-loading')).toHaveCount(0);
      } else {
        await expect(
          page.getByRole('button', { name: 'Send', exact: true }),
        ).toBeVisible();
      }

      await expect(page.getByTestId('status-card')).toHaveText(
        'Example fixture rendered successfully.: 1',
      );
      await expect(page.getByTestId('status')).toHaveText('idle');
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('text/event-stream');
      expect(requests).toHaveLength(toolRound ? 2 : 1);
      expect(requests[0]).not.toHaveProperty('model');
      expect(requests[0]['hashbrown']).toMatchObject({
        ui: true,
        responseSchema: expect.any(Object),
      });
      expect(mock.getRequests()).toHaveLength(toolRound ? 2 : 1);
      expect(
        mock.getRequests().every((entry) => entry.response.status === 200),
      ).toBe(true);
      expect(mock.getRequests()[0].body).toMatchObject({
        model: 'gpt-4.1-mini',
        stream: true,
        response_format: {
          type: 'json_schema',
          json_schema: {
            strict: true,
            schema: requests[0].hashbrown?.responseSchema,
          },
        },
      });
      if (toolRound) {
        expect(requests[1]['threadId']).toBe(requests[0]['threadId']);
        expect(requests[1]['messages']).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'tool',
              toolCallId: 'sample-control',
            }),
          ]),
        );
        expect(
          mock
            .getRequests()[1]
            .body?.messages.filter((message) => message.role === 'tool'),
        ).toHaveLength(1);
      }
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath('sample.png') });
    } finally {
      release();
      try {
        if (server?.listening) {
          server.closeAllConnections();
          await new Promise<void>((resolve, reject) =>
            server?.close((error) => (error ? reject(error) : resolve())),
          );
        }
      } finally {
        await mock.stop();
      }
    }
  });
}
