import { expect, test, vi } from 'vitest';

import {
  invokeMarketing,
  MARKETING_THREAD_ID,
} from '../../src/lib/marketing/marketing-client';

const INPUT = {
  baseUrl: 'https://marketing.example',
  serviceSecret: 'service-secret',
  trigger: 'cron' as const,
};

function state(operatorAlerts: string[]): Response {
  return new Response(
    JSON.stringify({
      trigger: 'cron',
      result: { leased: 1, published: 1, failed: 0, held: 0, operatorAlerts },
    }),
  );
}

test('invokeMarketing accepts all four operator alerts', async () => {
  const alerts = [
    'post_failed',
    'post_warning',
    'blog_not_live',
    'credential_expiring',
  ];

  const result = await invokeMarketing(INPUT, {
    fetch: vi.fn(async () => state(alerts)) as never,
  });

  expect(result).toEqual({
    operatorAlerts: alerts,
    threadId: MARKETING_THREAD_ID,
  });
});

test('invokeMarketing rejects an unknown operator alert', async () => {
  const invoked = invokeMarketing(INPUT, {
    fetch: vi.fn(async () => state(['mystery'])) as never,
  });

  await expect(invoked).rejects.toThrow('invalid state');
});
