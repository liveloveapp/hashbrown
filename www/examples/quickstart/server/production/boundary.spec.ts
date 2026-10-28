import { expect, test } from 'vitest';
import { issueIdentity, readIdentity, validateRun } from './boundary';

const secret = 'a-shared-development-secret-at-least-32-characters';

test('authenticates signed identities across replicas and refuses forged owner headers', () => {
  const cookie = issueIdentity(secret);

  const principal = readIdentity(cookie, secret);

  expect(principal?.id).toBeTruthy();
  expect(readIdentity(cookie, 'another-shared-secret')).toBeUndefined();
  expect(readIdentity('owner=victim', secret)).toBeUndefined();
});

test('rejects client tools and overrides while retaining native resume metadata', () => {
  const input = {
    threadId: 'thread-1',
    runId: 'run-1',
    messages: [{ id: 'u1', role: 'user', content: 'Plan the demo' }],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };

  const result = validateRun(input);

  expect(result.threadId).toBe('thread-1');
  expect(() =>
    validateRun({ ...input, tools: [{ name: 'acceptPlan', parameters: {} }] }),
  ).toThrow();
  expect(() =>
    validateRun({ ...input, forwardedProps: { system: 'bypass' } }),
  ).toThrow();
});
