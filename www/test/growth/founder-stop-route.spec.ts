import { expect, test, vi } from 'vitest';

import { createFounderStopRoute } from '../../src/app/%5F/growth/stop/handler';
import { mintToken, tamperToken, TEST_NOW, TEST_TOKEN_KEYRING } from './_keys';

const ORIGIN = 'https://hashbrown.dev/_/growth/stop';
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

function setup(now: Date = TEST_NOW) {
  const close = vi.fn(async () => undefined);
  const stopContact = vi.fn(async () => ({ applied: true, effective: true }));
  const route = createFounderStopRoute({
    now: () => now,
    loadTokenKeyring: () => TEST_TOKEN_KEYRING,
    createDatabase: () => ({ close }) as never,
    stopContact,
  });
  return { route, close, stopContact };
}

test('founder stop GET verifies a 24 hour token and POST stops with manual_suppression', async () => {
  const { route, stopContact, close } = setup();
  const token = mintToken('founder_stop');

  const page = await route.GET(new Request(`${ORIGIN}?token=${token}`));
  const response = await route.POST(
    new Request(ORIGIN, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ token }).toString(),
    }),
  );

  expect(page.status).toBe(200);
  expect(await page.text()).toContain('action="/_/growth/stop"');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(stopContact).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      contactId: '11111111-1111-4111-8111-111111111111',
      reason: 'manual_suppression',
      occurredAt: TEST_NOW,
      source: 'signed_founder_stop',
      provenance: {
        actor: 'founder',
        kind: 'founder_action',
        policyVersion: 'growth-lifecycle-v1',
      },
    }),
  );
  expect(close).toHaveBeenCalledTimes(1);
});

test('founder stop rejects an expired token and an unsubscribe token', async () => {
  const later = new Date(TEST_NOW.getTime() + 25 * 60 * 60 * 1000);
  const { route, stopContact } = setup(later);

  const expired = await route.GET(
    new Request(`${ORIGIN}?token=${mintToken('founder_stop')}`),
  );
  const wrongPurpose = await route.GET(
    new Request(`${ORIGIN}?token=${mintToken('unsubscribe', later)}`),
  );

  expect(expired.status).toBe(400);
  expect(wrongPurpose.status).toBe(400);
  expect(stopContact).not.toHaveBeenCalled();
});

test('founder stop POST rejects any query string', async () => {
  const { route, stopContact } = setup();
  const token = mintToken('founder_stop');

  const response = await route.POST(
    new Request(`${ORIGIN}?x=1`, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ token }).toString(),
    }),
  );

  expect(response.status).toBe(400);
  expect(stopContact).not.toHaveBeenCalled();
});

test('founder stop rejects a tampered signature on GET and POST', async () => {
  const { route, stopContact } = setup();
  const token = tamperToken(mintToken('founder_stop'));

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

test('founder stop returns 503 with Retry-After on a database fault', async () => {
  const rejecting = setup();
  rejecting.stopContact.mockRejectedValue(new Error('db down'));
  const unavailable = createFounderStopRoute({
    now: () => TEST_NOW,
    loadTokenKeyring: () => TEST_TOKEN_KEYRING,
    createDatabase: () => {
      throw new Error('no database');
    },
    stopContact: vi.fn(),
  });
  const post = () =>
    new Request(ORIGIN, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({
        token: mintToken('founder_stop'),
      }).toString(),
    });

  const stopFault = await rejecting.route.POST(post());
  const connectFault = await unavailable.POST(post());

  for (const response of [stopFault, connectFault]) {
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('Unable to process this request.');
  }
  expect(rejecting.close).toHaveBeenCalledTimes(1);
});
