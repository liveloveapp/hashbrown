import { createHmac } from 'node:crypto';
import { expect, test, vi } from 'vitest';

import {
  sha256Base64Url,
  verifyGoogleReplySignature,
} from '@hashbrownai-internal/growth';

import { createGoogleRepliesRoute } from '../../src/app/%5F/growth/replies/google/route';
import { TEST_NOW } from './_keys';

const ORIGIN = 'https://hashbrown.dev/_/growth/replies/google';
const SECRET = 's'.repeat(40);
const NONCE = 'nonce-nonce-nonce-1';

function signed(rawBody: string, timestamp = String(TEST_NOW.getTime())) {
  const canonical = `${timestamp}\n${NONCE}\n${sha256Base64Url(rawBody)}`;
  const signature = `v1=${createHmac('sha256', SECRET).update(canonical).digest('base64url')}`;
  return {
    'content-type': 'application/json',
    'x-hashbrown-timestamp': timestamp,
    'x-hashbrown-nonce': NONCE,
    'x-hashbrown-signature': signature,
  };
}

function setup(
  options: {
    processFails?: boolean;
    createFails?: boolean;
    secret?: string;
  } = {},
) {
  const close = vi.fn(async () => undefined);
  const processEvent = vi.fn(async () => {
    if (options.processFails) throw new Error('db');
    return {} as never;
  });
  const parseEvent = vi.fn((raw: string) => {
    const parsed = JSON.parse(raw) as { ok?: boolean };
    if (!parsed.ok) throw new Error('schema');
    return parsed as never;
  });
  const route = createGoogleRepliesRoute({
    now: () => TEST_NOW,
    loadSecret: () => options.secret ?? SECRET,
    verifySignature: verifyGoogleReplySignature,
    parseEvent,
    createDatabase: () => {
      if (options.createFails) throw new Error('db');
      return { close } as never;
    },
    processEvent,
  });
  return { route, processEvent, close };
}

function req(body: string, headers: Record<string, string>) {
  return new Request(ORIGIN, { method: 'POST', headers, body });
}

test('replies/google: 400 on bad signature, stale timestamp or schema; 413 oversize; 200 Accepted; 503 on database fault', async () => {
  const body = JSON.stringify({ ok: true });
  const { route, processEvent, close } = setup();

  const accepted = await route.POST(req(body, signed(body)));
  const badSignature = await route.POST(
    req(body, { ...signed(body), 'x-hashbrown-signature': 'v1=AAAA' }),
  );
  const stale = await route.POST(
    req(body, signed(body, String(TEST_NOW.getTime() - 10 * 60_000))),
  );
  const schema = JSON.stringify({ ok: false });
  const badSchema = await route.POST(req(schema, signed(schema)));
  const big = 'x'.repeat(40_000);
  const oversize = await route.POST(req(big, signed(big)));
  const unavailable = await setup({ processFails: true }).route.POST(
    req(body, signed(body)),
  );
  const noDatabase = await setup({ createFails: true }).route.POST(
    req(body, signed(body)),
  );

  expect(accepted.status).toBe(200);
  expect(await accepted.text()).toBe('Accepted');
  expect(processEvent).toHaveBeenCalledTimes(1);
  expect(processEvent).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      nonce: NONCE,
      timestamp: String(TEST_NOW.getTime()),
      requestDigest: sha256Base64Url(body),
      receivedAt: TEST_NOW,
    }),
  );
  expect(close).toHaveBeenCalledTimes(1);
  expect(badSignature.status).toBe(400);
  expect(stale.status).toBe(400);
  expect(badSchema.status).toBe(400);
  expect(oversize.status).toBe(413);
  expect(unavailable.status).toBe(503);
  expect(noDatabase.status).toBe(503);
});

test('replies/google answers 503 before verifying when the secret is not configured', async () => {
  const body = JSON.stringify({ ok: true });
  const { route, processEvent } = setup({ secret: '' });

  const response = await route.POST(req(body, signed(body)));

  expect(response.status).toBe(503);
  expect(processEvent).not.toHaveBeenCalled();
});
