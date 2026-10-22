import { expect, test, vi } from 'vitest';

import { createFounderApproveInstallRoute } from '../../src/app/%5F/growth/approve-install/route';
import { mintToken, TEST_NOW, TEST_TOKEN_KEYRING } from './_keys';

const ORIGIN = 'https://hashbrown.dev/_/growth/approve-install';
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
const EMAIL_KEYRING = { active: { version: 1, secret: 'e'.repeat(32) } };

function setup(
  options: { createFails?: boolean; approveFails?: boolean } = {},
) {
  const close = vi.fn(async () => undefined);
  const approve = vi.fn(async () => {
    if (options.approveFails) throw new Error('db');
    return { approved: true as const, contactId: 'c1', changed: true };
  });
  const route = createFounderApproveInstallRoute({
    now: () => TEST_NOW,
    loadTokenKeyring: () => TEST_TOKEN_KEYRING,
    loadEmailKeyring: () => EMAIL_KEYRING,
    createDatabase: () => {
      if (options.createFails) throw new Error('db');
      return { close } as never;
    },
    approveContactFromInstallDigest: approve,
  });
  return { route, approve, close };
}

function post(body: string, url = ORIGIN) {
  return new Request(url, { method: 'POST', headers: FORM, body });
}

test('approve-install GET renders a form for a valid token and 400 otherwise', async () => {
  const { route, approve } = setup();
  const token = mintToken('founder_approve_install');

  const page = await route.GET(new Request(`${ORIGIN}?token=${token}`));
  const wrongPurpose = await route.GET(
    new Request(`${ORIGIN}?token=${mintToken('founder_stop')}`),
  );
  const missing = await route.GET(new Request(ORIGIN));

  expect(page.status).toBe(200);
  const html = await page.text();
  expect(html).toContain('action="/_/growth/approve-install"');
  expect(html).toContain('method="post"');
  expect(wrongPurpose.status).toBe(400);
  expect(missing.status).toBe(400);
  expect(approve).not.toHaveBeenCalled();
});

test('approve-install POST approves once, rejects a query string, a second field and an oversize body', async () => {
  const { route, approve, close } = setup();
  const token = mintToken('founder_approve_install');
  const body = new URLSearchParams({ token }).toString();

  const response = await route.POST(post(body));
  const query = await route.POST(post(body, `${ORIGIN}?x=1`));
  const extra = await route.POST(post(`${body}&other=1`));
  const oversize = await route.POST(post(`token=${'a'.repeat(3_000)}`));

  expect(response.status).toBe(200);
  const page = await response.text();
  expect(page).toContain('<h1>Outreach approved</h1>');
  expect(page).toContain('<p>Outreach approved.</p>');
  expect(page).not.toContain('enrolled');
  expect(approve).toHaveBeenCalledTimes(1);
  expect(approve).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      installObservationId: '11111111-1111-4111-8111-111111111111',
      occurredAt: TEST_NOW,
      keyring: EMAIL_KEYRING,
    }),
  );
  expect(close).toHaveBeenCalledTimes(1);
  expect(query.status).toBe(400);
  expect(extra.status).toBe(400);
  expect(oversize.status).toBe(400);
});

test('approve-install POST answers 400 when the digest cannot be approved and 503 on a database fault', async () => {
  const token = mintToken('founder_approve_install');
  const body = new URLSearchParams({ token }).toString();
  const refused = createFounderApproveInstallRoute({
    now: () => TEST_NOW,
    loadTokenKeyring: () => TEST_TOKEN_KEYRING,
    loadEmailKeyring: () => EMAIL_KEYRING,
    createDatabase: () => ({}) as never,
    approveContactFromInstallDigest: async () => ({
      approved: false,
      reason: 'stopped',
    }),
  });

  const declined = await refused.POST(post(body));
  const noDatabase = await setup({ createFails: true }).route.POST(post(body));
  const failed = await setup({ approveFails: true }).route.POST(post(body));

  expect(declined.status).toBe(400);
  expect(noDatabase.status).toBe(503);
  expect(noDatabase.headers.get('retry-after')).toBe('30');
  expect(failed.status).toBe(503);
  expect(failed.headers.get('retry-after')).toBe('30');
});
