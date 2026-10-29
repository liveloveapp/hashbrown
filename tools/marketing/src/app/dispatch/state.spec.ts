import { expect, test } from 'vitest';

import schema from './state.ts';

test('dispatch state rejects unknown keys, an unknown trigger and an unknown alert', () => {
  const valid = { trigger: 'cron' };

  const ok = schema.safeParse(valid);
  const extraKey = schema.safeParse({ ...valid, extra: 1 });
  const badTrigger = schema.safeParse({ trigger: 'nudge' });
  const badAlert = schema.safeParse({
    ...valid,
    result: {
      leased: 0,
      published: 0,
      failed: 0,
      held: 0,
      operatorAlerts: ['mystery'],
    },
  });

  expect(ok.success).toBe(true);
  expect(extraKey.success).toBe(false);
  expect(badTrigger.success).toBe(false);
  expect(badAlert.success).toBe(false);
});

test('the dispatch state accepts exactly the three operator alerts', () => {
  const alerts = ['post_failed', 'blog_not_live', 'credential_expiring'];
  const parse = (operatorAlerts: string[]) =>
    schema.safeParse({
      trigger: 'cron',
      result: { leased: 0, published: 0, failed: 0, held: 0, operatorAlerts },
    }).success;

  const accepted = alerts.map((alert) => parse([alert]));
  const rejected = parse(['fourth_alert']);

  expect(accepted).toEqual([true, true, true]);
  expect(rejected).toBe(false);
});
