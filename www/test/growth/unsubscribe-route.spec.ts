import { expect, test, vi } from 'vitest';
import {
  growthStopEventKey,
  verifyGrowthActionToken,
} from '@hashbrownai-internal/growth';

import { createUnsubscribeRoute } from '../../src/app/%5F/unsubscribe/handler';
import { mintToken, tamperToken, TEST_NOW, TEST_TOKEN_KEYRING } from './_keys';

const ORIGIN = 'https://hashbrown.dev/_/unsubscribe';
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

function setup() {
  const close = vi.fn(async () => undefined);
  const stopContact = vi.fn(async () => ({ applied: true, effective: true }));
  const createDatabase = vi.fn(() => ({ close }) as never);
  const route = createUnsubscribeRoute({
    now: () => TEST_NOW,
    loadTokenKeyring: () => TEST_TOKEN_KEYRING,
    createDatabase,
    stopContact,
  });
  return { route, close, createDatabase, stopContact };
}

test('GET /_/unsubscribe with a valid token renders the confirm form', async () => {
  const { route } = setup();
  const token = mintToken('unsubscribe');

  const response = await route.GET(new Request(`${ORIGIN}?token=${token}`));

  const html = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(html).toContain('action="/_/unsubscribe"');
  expect(html).toContain(`value="${token}"`);
});

test('GET /_/unsubscribe with an invalid token returns 400', async () => {
  const { route } = setup();

  const response = await route.GET(new Request(`${ORIGIN}?token=nope`));

  expect(response.status).toBe(400);
  expect(response.headers.get('cache-control')).toBe('no-store');
});

test('GET /_/unsubscribe with a founder_stop token returns 400', async () => {
  const { route } = setup();

  const response = await route.GET(
    new Request(`${ORIGIN}?token=${mintToken('founder_stop')}`),
  );

  expect(response.status).toBe(400);
});

test('POST one-click unsubscribe stops the contact with one_click provenance', async () => {
  const { route, stopContact, close } = setup();
  const token = mintToken('unsubscribe');
  const payload = verifyGrowthActionToken(token, {
    expectedPurpose: 'unsubscribe',
    keyring: TEST_TOKEN_KEYRING,
    now: TEST_NOW,
  }) as NonNullable<ReturnType<typeof verifyGrowthActionToken>>;

  const response = await route.POST(
    new Request(`${ORIGIN}?token=${token}`, {
      method: 'POST',
      headers: FORM,
      body: 'List-Unsubscribe=One-Click',
    }),
  );

  expect(response.status).toBe(200);
  expect(stopContact).toHaveBeenCalledWith(expect.anything(), {
    contactId: '11111111-1111-4111-8111-111111111111',
    reason: 'unsubscribe',
    eventKey: growthStopEventKey(payload),
    occurredAt: TEST_NOW,
    source: 'signed_unsubscribe',
    provenance: {
      actor: 'recipient',
      kind: 'one_click',
      policyVersion: 'growth-lifecycle-v1',
    },
  });
  expect(close).toHaveBeenCalledTimes(1);
});

test('POST form unsubscribe stops the contact and returns 200', async () => {
  const { route, stopContact } = setup();
  const token = mintToken('unsubscribe');

  const response = await route.POST(
    new Request(ORIGIN, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ token }).toString(),
    }),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(stopContact).toHaveBeenCalledTimes(1);
});

test('POST rejects a wrong content type and extra fields with 400', async () => {
  const { route, stopContact } = setup();
  const token = mintToken('unsubscribe');

  const wrongType = await route.POST(
    new Request(ORIGIN, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: `token=${token}`,
    }),
  );
  const extra = await route.POST(
    new Request(ORIGIN, {
      method: 'POST',
      headers: FORM,
      body: `token=${token}&other=1`,
    }),
  );

  expect(wrongType.status).toBe(400);
  expect(extra.status).toBe(400);
  expect(stopContact).not.toHaveBeenCalled();
});

test('unsubscribe returns 503 with Retry-After on a database fault', async () => {
  const { route, stopContact } = setup();
  stopContact.mockRejectedValue(new Error('db down'));
  const token = mintToken('unsubscribe');

  const response = await route.POST(
    new Request(ORIGIN, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ token }).toString(),
    }),
  );

  expect(response.status).toBe(503);
  expect(response.headers.get('retry-after')).toBe('30');
});

test('GET without a token returns 400 and stops nothing', async () => {
  const { route, createDatabase, stopContact } = setup();

  const bare = await route.GET(new Request(ORIGIN));
  const email = await route.GET(new Request(`${ORIGIN}?email=a%40example.com`));

  expect(bare.status).toBe(400);
  expect(email.status).toBe(400);
  expect(email.headers.get('cache-control')).toBe('no-store');
  expect(createDatabase).not.toHaveBeenCalled();
  expect(stopContact).not.toHaveBeenCalled();
});

test('unsubscribe rejects a tampered signature on GET and POST', async () => {
  const { route, stopContact } = setup();
  const token = tamperToken(mintToken('unsubscribe'));

  const page = await route.GET(new Request(`${ORIGIN}?token=${token}`));
  const response = await route.POST(
    new Request(ORIGIN, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ token }).toString(),
    }),
  );

  expect(page.status).toBe(400);
  expect(response.status).toBe(400);
  expect(stopContact).not.toHaveBeenCalled();
});

test('POST multipart one-click unsubscribe accepts the signed query token', async () => {
  const { route, stopContact, close } = setup();
  const token = mintToken('unsubscribe');
  const form = new FormData();
  form.set('List-Unsubscribe', 'One-Click');

  const response = await route.POST(
    new Request(`${ORIGIN}?token=${token}`, { method: 'POST', body: form }),
  );

  expect(response.status).toBe(200);
  expect(stopContact).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      source: 'signed_unsubscribe',
      reason: 'unsubscribe',
    }),
  );
  expect(close).toHaveBeenCalledTimes(1);
});

test('POST multipart confirmation accepts a signed body token', async () => {
  const { route, stopContact } = setup();
  const form = new FormData();
  form.set('token', mintToken('unsubscribe'));

  const response = await route.POST(
    new Request(ORIGIN, { method: 'POST', body: form }),
  );

  expect(response.status).toBe(200);
  expect(stopContact).toHaveBeenCalledTimes(1);
});

test.each([
  {
    entries: [
      ['List-Unsubscribe', 'One-Click'],
      ['List-Unsubscribe', 'One-Click'],
    ],
  },
  {
    entries: [
      ['List-Unsubscribe', 'One-Click'],
      ['extra', 'value'],
    ],
  },
  {
    entries: [
      ['List-Unsubscribe', 'One-Click'],
      ['token', 'other'],
    ],
  },
  { entries: [['List-Unsubscribe', 'Wrong']] },
  { entries: [] },
])(
  'POST multipart rejects invalid one-click fields $entries',
  async ({ entries }) => {
    const { route, createDatabase, stopContact } = setup();
    const form = new FormData();
    for (const [name, value] of entries) form.append(name, value);

    const response = await route.POST(
      new Request(`${ORIGIN}?token=${mintToken('unsubscribe')}`, {
        method: 'POST',
        body: form,
      }),
    );

    expect(response.status).toBe(400);
    expect(createDatabase).not.toHaveBeenCalled();
    expect(stopContact).not.toHaveBeenCalled();
  },
);

test.each(['List-Unsubscribe', 'token'])(
  'POST multipart rejects file field %s',
  async (name) => {
    const { route, createDatabase } = setup();
    const form = new FormData();
    form.set(
      name,
      new Blob([name === 'token' ? mintToken('unsubscribe') : 'One-Click']),
      'value.txt',
    );
    const url =
      name === 'token' ? ORIGIN : `${ORIGIN}?token=${mintToken('unsubscribe')}`;

    const response = await route.POST(
      new Request(url, { method: 'POST', body: form }),
    );

    expect(response.status).toBe(400);
    expect(createDatabase).not.toHaveBeenCalled();
  },
);

test.each(['duplicate-token', 'extra-query', 'tampered', 'wrong-purpose'])(
  'POST multipart rejects invalid signed query %s',
  async (kind) => {
    const { route, createDatabase } = setup();
    const token = mintToken('unsubscribe');
    const query =
      kind === 'tampered'
        ? `token=${tamperToken(token)}`
        : kind === 'wrong-purpose'
          ? `token=${mintToken('founder_stop')}`
          : `token=${token}&${kind === 'duplicate-token' ? 'token' : 'extra'}=${token}`;
    const form = new FormData();
    form.set('List-Unsubscribe', 'One-Click');

    const response = await route.POST(
      new Request(`${ORIGIN}?${query}`, { method: 'POST', body: form }),
    );

    expect(response.status).toBe(400);
    expect(createDatabase).not.toHaveBeenCalled();
  },
);

test('POST multipart rejects a missing boundary', async () => {
  const { route, createDatabase } = setup();

  const response = await route.POST(
    new Request(`${ORIGIN}?token=${mintToken('unsubscribe')}`, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data' },
      body: 'List-Unsubscribe=One-Click',
    }),
  );

  expect(response.status).toBe(400);
  expect(createDatabase).not.toHaveBeenCalled();
});

test.each([undefined, '2049'])(
  'POST multipart bounds streamed bodies with content-length %s',
  async (contentLength) => {
    const { route, createDatabase } = setup();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(2049)));
      },
      cancel,
    });
    const headers = new Headers({
      'content-type': 'multipart/form-data; boundary=test',
    });
    if (contentLength) headers.set('content-length', contentLength);
    const request = new Request(`${ORIGIN}?token=${mintToken('unsubscribe')}`, {
      method: 'POST',
      headers,
      body,
      duplex: 'half',
    } as RequestInit);

    const response = await route.POST(request);

    expect(response.status).toBe(400);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(createDatabase).not.toHaveBeenCalled();
  },
);
