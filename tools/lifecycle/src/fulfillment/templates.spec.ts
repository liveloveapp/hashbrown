import { expect, test } from 'vitest';

import { campaignDraftViolations } from '../campaign/templates.ts';
import { renderFulfillmentTemplate } from './templates.ts';

test('renderFulfillmentTemplate renders Got your note and rejects any other context', () => {
  const rendered = renderFulfillmentTemplate({ context: 'unstuck' });

  expect(rendered.subject).toBe('Got your note');
  expect(rendered.body).toContain('https://hashbrown.dev/docs');
  expect(rendered.body).toBe(
    "Thanks for writing. I read every one of these myself and I'll reply with something useful, usually within a business day.\n\nIf it helps in the meantime, the docs for the part you're on are at https://hashbrown.dev/docs.",
  );
  expect(rendered.body).not.toContain('Brian');
  expect(campaignDraftViolations(rendered)).toEqual([]);
  expect(() => renderFulfillmentTemplate({ context: 'pricing' })).toThrow();
  expect(() => renderFulfillmentTemplate(null)).toThrow();
  expect(() =>
    renderFulfillmentTemplate({ context: 'unstuck', extra: true }),
  ).toThrow();
});
