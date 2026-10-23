import { expect, test } from 'vitest';
import * as recovery from '../src/app/%5F/cron/inbox-recovery/route';
import * as lifecycle from '../src/app/%5F/cron/lifecycle/route';
import * as unstuck from '../src/app/%5F/forms/unstuck/route';
import * as approve from '../src/app/%5F/growth/approve-install/route';
import * as stop from '../src/app/%5F/growth/stop/route';
import * as unsubscribe from '../src/app/%5F/unsubscribe/route';
import * as inbound from '../src/app/%5F/webhooks/resend-inbound/route';
import * as webhook from '../src/app/%5F/webhooks/resend/route';
import * as docsCard from '../src/app/og/docs/[sdk]/[...slug]/route';

test.each([
  ['inbox recovery', recovery, ['GET', 'maxDuration']],
  ['lifecycle', lifecycle, ['GET', 'dynamic', 'maxDuration']],
  ['unstuck', unstuck, ['POST', 'dynamic']],
  ['approve install', approve, ['GET', 'POST']],
  ['founder stop', stop, ['GET', 'POST']],
  ['unsubscribe', unsubscribe, ['GET', 'POST']],
  ['inbound webhook', inbound, ['POST']],
  ['delivery webhook', webhook, ['POST']],
  [
    'docs card',
    docsCard,
    ['GET', 'dynamic', 'dynamicParams', 'generateStaticParams'],
  ],
] as const)(
  '%s entry exports only its Next.js handlers and configuration',
  (_name, entry, expected) => {
    const exports = Object.keys(entry);

    const actual = exports.toSorted();

    expect(actual).toEqual([...expected].sort());
  },
);
