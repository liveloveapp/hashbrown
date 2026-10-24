import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const COOKIE = 'atc_visitor';
const LIFETIME_MS = 86_400_000;

/** A server-verified anonymous principal and, when needed, its replacement cookie. */
export interface VisitorIdentity {
  readonly id: string;
  readonly cookie?: string;
}

/**
 * Creates signed visitor cookies without keeping identity in process memory.
 * The key must be shared across hosted instances. Conversation IDs stay in the
 * browser's page memory; this cookie grants no history restoration endpoint.
 */
export function createVisitorIdentity(options: {
  readonly key: string;
  readonly secure: boolean;
  readonly now?: () => number;
}): { readonly read: (cookies: string | undefined) => VisitorIdentity } {
  if (Buffer.byteLength(options.key) < 32) {
    throw new Error('ATC_B4RUN_COOKIE_SECRET must contain at least 32 bytes');
  }
  const now = options.now ?? Date.now;
  const sign = (value: string) =>
    createHmac('sha256', options.key).update(value).digest('base64url');

  return {
    read(cookies) {
      const candidates = (cookies ?? '')
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part.startsWith(`${COOKIE}=`));
      if (candidates.length === 1) {
        const token = candidates[0].slice(COOKIE.length + 1);
        const match = /^([a-f0-9-]{36})\.(\d{1,16})\.([a-zA-Z0-9_-]{43})$/.exec(
          token,
        );
        if (match) {
          const [, id, issued, signature] = match;
          const expected = sign(`${id}.${issued}`);
          const age = now() - Number(issued);
          if (
            age >= 0 &&
            age < LIFETIME_MS &&
            timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
          ) {
            return { id };
          }
        }
      }
      const id = randomUUID();
      const value = `${id}.${now()}`;

      return {
        id,
        cookie: `${COOKIE}=${value}.${sign(value)}; HttpOnly; SameSite=Lax; Path=/api/run; Max-Age=86400${options.secure ? '; Secure' : ''}`,
      };
    },
  };
}
