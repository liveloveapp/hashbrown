import { expect, test, vi } from 'vitest';

import { createResendInboundRoute } from '../../src/app/%5F/webhooks/resend-inbound/route';

const headers = {
  'svix-id': 'msg_1',
  'svix-timestamp': '1760000000',
  'svix-signature': 'v1,test',
};
const config = {
  enabled: true as const,
  address: 'brian@replies.hashbrown.dev',
  startedAt: new Date('2026-10-22T00:00:00Z'),
};

function setup(overrides: Record<string, unknown> = {}) {
  const admit = vi.fn(async () => 'incoming-1');
  const process = vi.fn(async () => 'stopped');
  const close = vi.fn(async () => undefined);
  const verify = vi.fn(() => ({
    type: 'email.received',
    data: { email_id: 'incoming-1', to: [config.address] },
  }));
  const route = createResendInboundRoute({
    loadConfig: () => config,
    loadSecret: () => 'whsec_test',
    verify,
    createDatabase: () => ({ close }),
    admit,
    process,
    ...overrides,
  } as never);
  return { route, admit, process, close, verify };
}

test('inbound endpoint verifies the raw signature before opening the database', async () => {
  const createDatabase = vi.fn();
  const { route } = setup({
    verify: () => {
      throw new Error('bad signature');
    },
    createDatabase,
  });

  const response = await route.POST(
    new Request('https://hashbrown.dev/_/webhooks/resend-inbound', {
      method: 'POST',
      headers,
      body: '{}',
    }),
  );

  expect(response.status).toBe(400);
  expect(createDatabase).not.toHaveBeenCalled();
});

test('unconfigured pilot refuses mail and oversize payloads are rejected', async () => {
  const disabled = setup({ loadConfig: () => ({ enabled: false }) });
  const enabled = setup();

  expect(
    (
      await disabled.route.POST(
        new Request('https://hashbrown.dev', {
          method: 'POST',
          headers,
          body: '{}',
        }),
      )
    ).status,
  ).toBe(503);
  expect(
    (
      await enabled.route.POST(
        new Request('https://hashbrown.dev', {
          method: 'POST',
          headers,
          body: 'x'.repeat(65537),
        }),
      )
    ).status,
  ).toBe(413);
});

test('a durable early reply is accepted for recovery and the database is closed', async () => {
  const process = vi.fn(async () => 'pending');
  const { route, admit, close } = setup({ process });

  const response = await route.POST(
    new Request('https://hashbrown.dev', {
      method: 'POST',
      headers,
      body: '{}',
    }),
  );

  expect(response.status).toBe(200);
  expect(admit).toHaveBeenCalled();
  expect(process).toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

test('a database admission failure requests provider retry', async () => {
  const { route, close } = setup({
    admit: async () => {
      throw new Error('unavailable');
    },
  });

  expect(
    (
      await route.POST(
        new Request('https://hashbrown.dev', {
          method: 'POST',
          headers,
          body: '{}',
        }),
      )
    ).status,
  ).toBe(503);
  expect(close).toHaveBeenCalledOnce();
});

test.each(['stopped', 'ignored', 'pending'])(
  'inbound forwards admitted %s mail',
  async (status) => {
    const forwardReceipt = vi.fn(async () => 'forward-id');
    const { route } = setup({
      process: vi.fn(async () => status),
      forwardReceipt,
    });

    const response = await route.POST(
      new Request('https://hashbrown.dev', {
        method: 'POST',
        headers,
        body: '{}',
      }),
    );

    expect(response.status).toBe(200);
    expect(forwardReceipt).toHaveBeenCalledWith(
      expect.anything(),
      'incoming-1',
    );
  },
);

test('inbound still forwards after reply processing fails and requests retry', async () => {
  const forwardReceipt = vi.fn(async () => 'forward-id');
  const { route, close } = setup({
    process: vi.fn().mockRejectedValue(new Error('stop failed')),
    forwardReceipt,
  });

  const response = await route.POST(
    new Request('https://hashbrown.dev', {
      method: 'POST',
      headers,
      body: '{}',
    }),
  );

  expect(response.status).toBe(503);
  expect(forwardReceipt).toHaveBeenCalledWith(expect.anything(), 'incoming-1');
  expect(close).toHaveBeenCalledOnce();
});

test('inbound forward failure requests retry after durable reply processing', async () => {
  const forwardReceipt = vi.fn().mockRejectedValue(new Error('send failed'));
  const { route, process, close } = setup({ forwardReceipt });

  const response = await route.POST(
    new Request('https://hashbrown.dev', {
      method: 'POST',
      headers,
      body: '{}',
    }),
  );

  expect(response.status).toBe(503);
  expect(process).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
