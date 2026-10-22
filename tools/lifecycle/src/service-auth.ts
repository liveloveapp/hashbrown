import { timingSafeEqual } from 'node:crypto';

/**
 * Compares an `Authorization` header with `Bearer <secret>` in constant time.
 *
 * @param authorization - The raw `Authorization` header value, if any.
 * @param secret - The shared service secret, if configured.
 * @returns `true` only when both values exist and the header is exactly
 * `Bearer ${secret}`; a missing value, an empty secret or any length
 * mismatch is `false`.
 */
export function hasExactBearerToken(
  authorization: string | undefined,
  secret: string | undefined,
): boolean {
  if (!authorization || !secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const actual = Buffer.from(authorization, 'utf8');
  return (
    expected.byteLength === actual.byteLength &&
    timingSafeEqual(expected, actual)
  );
}
