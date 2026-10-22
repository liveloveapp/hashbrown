import { expect, test } from 'vitest';

import schema from './state.ts';

test('dispatch state rejects unknown keys, a non-uuid submission_id and an unknown alert', () => {
  const valid = { trigger: 'cron' };

  const ok = schema.safeParse(valid);
  const extraKey = schema.safeParse({ ...valid, extra: 1 });
  const badId = schema.safeParse({ ...valid, submission_id: 'not-a-uuid' });
  const badAlert = schema.safeParse({
    ...valid,
    result: {
      leased: 0,
      dispatched: 0,
      recoveryPaused: false,
      operatorAlerts: ['mystery'],
    },
  });

  expect(ok.success).toBe(true);
  expect(extraKey.success).toBe(false);
  expect(badId.success).toBe(false);
  expect(badAlert.success).toBe(false);
});
