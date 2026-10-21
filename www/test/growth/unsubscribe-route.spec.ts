import { expect, test, vi } from 'vitest';
import {
  growthStopEventKey,
  verifyGrowthActionToken,
} from '@hashbrownai-internal/growth';

import { createUnsubscribeRoute } from '../../src/app/%5F/unsubscribe/route';
import { mintToken, tamperToken, TEST_NOW, TEST_TOKEN_KEYRING } from './_keys';

const ORIGIN = 'https://hashbrown.dev/_/unsubscribe';
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

function setup() {
  const close = vi.fn(async () => undefined);
  const stopContact = vi.fn(async () => ({ applied: true, effective: true }));
  const stopLegacyEmailUnsubscribe = vi.fn(async () => ({
    applied: true,
    contactMatched: true,
    effective: true,
  }));
  const route = createUnsubscribeRoute({
    now: () => TEST_NOW,
    loadTokenKeyring: () => TEST_TOKEN_KEYRING,
    loadEmailKeyring: () => ({
      active: { version: 1, secret: 'e'.repeat(48) },
    }),
    createDatabase: () => ({ close }) as never,
    stopContact,
    stopLegacyEmailUnsubscribe,
  });
  return { route, close, stopContact, stopLegacyEmailUnsubscribe };
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

test('legacy GET ?email= answers 200 and 503 on a database fault', async () => {
  const { route, stopLegacyEmailUnsubscribe, close } = setup();

  const ok = await route.GET(new Request(`${ORIGIN}?email=a%40example.com`));
  stopLegacyEmailUnsubscribe.mockRejectedValue(new Error('db down'));
  const fault = await route.GET(new Request(`${ORIGIN}?email=a%40example.com`));

  expect(ok.status).toBe(200);
  expect(fault.status).toBe(503);
  expect(fault.headers.get('retry-after')).toBe('30');
  expect(close).toHaveBeenCalledTimes(2);
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
