import { expect, test, vi } from 'vitest';

import {
  trustedFormClientIp,
  UNSTUCK_FALLBACK_ADDRESS,
  UNSTUCK_FORM_DISCLOSURE,
  UNSTUCK_FORM_POLICY_VERSION,
  unstuckFormEnabled,
} from '../../src/lib/growth/form-route';

function req(ip?: string): Request {
  return new Request('https://hashbrown.dev/_/forms/unstuck', {
    method: 'POST',
    headers: ip ? { 'x-vercel-forwarded-for': ip } : {},
  });
}

test('trusted IP comes only from x-vercel-forwarded-for on Vercel', () => {
  vi.stubEnv('VERCEL', '1');
  const onVercel = trustedFormClientIp(req('203.0.113.7'));
  const invalid = trustedFormClientIp(req('not-an-ip'));
  const missing = trustedFormClientIp(req());
  vi.stubEnv('VERCEL', '');
  const elsewhere = trustedFormClientIp(req('203.0.113.7'));
  const spoofed = trustedFormClientIp(
    new Request('https://hashbrown.dev/', {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    }),
  );

  expect(onVercel).toBe('203.0.113.7');
  expect(invalid).toBeUndefined();
  expect(missing).toBeUndefined();
  expect(elsewhere).toBeUndefined();
  expect(spoofed).toBeUndefined();
});

test('the switch accepts only exact true and logs a misconfigured value once without it', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  const on = unstuckFormEnabled({ GROWTH_UNSTUCK_FORM_ENABLED: 'true' });
  const off = unstuckFormEnabled({ GROWTH_UNSTUCK_FORM_ENABLED: 'false' });
  const unset = unstuckFormEnabled({});
  const quietCount = warn.mock.calls.length;
  const loud = unstuckFormEnabled({ GROWTH_UNSTUCK_FORM_ENABLED: 'TRUE ' });

  expect(on).toBe(true);
  expect(off).toBe(false);
  expect(unset).toBe(false);
  expect(quietCount).toBe(0);
  expect(loud).toBe(false);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith('[unstuck-form-misconfigured]');
});

test('the consent text, version and fallback address are the approved values', () => {
  expect(UNSTUCK_FORM_POLICY_VERSION).toBe('unstuck_v1.2026-10-22');
  expect(UNSTUCK_FORM_DISCLOSURE).toBe(
    'By sending, you agree Brian may follow up by email about your request, including a short three-email note about building with Hashbrown. Unsubscribe anytime.',
  );
  expect(UNSTUCK_FALLBACK_ADDRESS).toBe('brian@liveloveapp.com');
});
