import { expect, test, vi } from 'vitest';

import {
  jsonResponse,
  trustedFormClientIp,
  UNSTUCK_FALLBACK_ADDRESS,
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

test('the fallback address is brian@hashbrown.dev', () => {
  expect(UNSTUCK_FALLBACK_ADDRESS).toBe('brian@hashbrown.dev');
});

test('jsonResponse keeps headers passed as a Headers instance or pairs and is never cached', async () => {
  const fromHeaders = jsonResponse(
    { ok: true },
    429,
    new Headers({ 'Retry-After': '60', 'Cache-Control': 'public' }),
  );
  const fromPairs = jsonResponse({ ok: true }, 409, [['Retry-After', '0']]);

  const bodies = [await fromHeaders.json(), await fromPairs.json()];

  expect(bodies).toEqual([{ ok: true }, { ok: true }]);
  expect(fromHeaders.status).toBe(429);
  expect(fromHeaders.headers.get('retry-after')).toBe('60');
  expect(fromHeaders.headers.get('cache-control')).toBe('no-store');
  expect(fromPairs.headers.get('retry-after')).toBe('0');
  expect(fromPairs.headers.get('cache-control')).toBe('no-store');
});
