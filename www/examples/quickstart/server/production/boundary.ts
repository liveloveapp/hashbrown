import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';

const cookieName = 'hashbrown_production';

/** Issues the local adapter's signed anonymous identity; replace this adapter with verified account authentication. */
export function issueIdentity(secret: string): string {
  const id = randomUUID();
  return `${cookieName}=${id}.${createHmac('sha256', secret).update(id).digest('hex')}`;
}

/** Verifies a shared-secret cookie without accepting identity from owner headers or request bodies. */
export function readIdentity(
  cookie: string | undefined,
  secret: string,
): { id: string } | undefined {
  const value = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  const match = value?.match(/^([a-f0-9-]{36})\.([a-f0-9]{64})$/);
  if (!match) return undefined;
  const expected = createHmac('sha256', secret).update(match[1]).digest();
  return timingSafeEqual(expected, Buffer.from(match[2], 'hex'))
    ? { id: match[1] }
    : undefined;
}

/** Bounds the native envelope and refuses browser-owned tools, state and runtime overrides. */
export function validateRun(value: unknown) {
  if (JSON.stringify(value).length > 128_000)
    throw new Error('Conversation too large');
  const input = RunAgentInputSchema.parse(value);
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.threadId) ||
    input.runId.length > 100 ||
    input.messages.length > 80 ||
    input.tools.length ||
    input.context.length ||
    Object.keys(input.forwardedProps ?? {}).length
  )
    throw new Error('Unsupported configuration');
  if (
    input.messages.some(
      (message) =>
        message.role === 'system' ||
        message.role === 'developer' ||
        (typeof message.content === 'string' && message.content.length > 8000),
    )
  )
    throw new Error('Unsupported history');
  if (
    input.messages.some(
      (message) =>
        message.role === 'user' &&
        (typeof message.content !== 'string' || message.content.length > 2000),
    )
  )
    throw new Error('Invalid prompt');
  return { ...input, state: {} };
}
