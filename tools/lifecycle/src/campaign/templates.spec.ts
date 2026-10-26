import { expect, test } from 'vitest';

import {
  APPROVED_CAMPAIGN_LINKS,
  campaignDraftViolations,
  type CampaignStep,
  FOUNDER_BOOKING_URL,
  normalizeCampaignDraft,
  renderCampaignTemplate,
} from './templates.ts';

const STEPS: CampaignStep[] = ['immediate', 'day-3', 'day-8'];

function linksIn(value: string): string[] {
  return value.match(/https?:\/\/[^\s]+/gu) ?? [];
}

test('every shipped campaign template passes the linter and immediate carries no link', () => {
  const options = (step: CampaignStep) => ({
    maxLinks: step === 'day-8' ? (2 as const) : (1 as const),
  });

  const results = STEPS.map((step) => {
    const draft = renderCampaignTemplate(step);
    return {
      step,
      draft,
      violations: campaignDraftViolations(draft, options(step)),
    };
  });

  for (const result of results) expect(result.violations).toEqual([]);
  expect(results[0].draft.subject).toBe('Engineer to engineer');
  expect(results[1].draft.subject).toBe('Get your generative UI working');
  expect(results[2].draft.subject).toBe(
    'One last note from the Hashbrown founder',
  );
  expect(linksIn(results[0].draft.body)).toEqual([]);
  expect(linksIn(results[1].draft.body)).toEqual([FOUNDER_BOOKING_URL]);
  expect(FOUNDER_BOOKING_URL).toBe('https://hashbrown.dev/call');
});

test('the founder sequence says founder, never founding engineer', () => {
  const drafts = STEPS.map((step) => renderCampaignTemplate(step));

  const bodies = drafts.map((draft) => draft.body);

  for (const body of bodies) expect(body).not.toContain('founding engineer');
  expect(bodies[0]).toContain("I'm the founder of Hashbrown, and I'm offering");
  expect(bodies[1]).toContain(
    'No sales. Just me, the founder, meeting with you and your team.',
  );
});

test('day-8 carries exactly the booking and threadplane links and is rejected with maxLinks 1', () => {
  const draft = renderCampaignTemplate('day-8');

  const links = linksIn(draft.body);
  const strict = campaignDraftViolations(draft);
  const relaxed = campaignDraftViolations(draft, { maxLinks: 2 });

  expect(links).toEqual(['https://threadplane.ai', FOUNDER_BOOKING_URL]);
  expect(strict).toEqual(['message contains more than one link']);
  expect(relaxed).toEqual([]);
  expect([...APPROVED_CAMPAIGN_LINKS].sort()).toEqual([
    'https://hashbrown.dev/call',
    'https://hashbrown.dev/docs',
    'https://hashbrown.dev/unstuck',
    'https://threadplane.ai',
  ]);
});

test('linter rejects surveillance phrasing, a calendar host, utm markup, two question marks, 121 words and an unapproved link', () => {
  const ok = { subject: 'Hello', body: 'A short note.' };

  const surveillance = campaignDraftViolations({
    ...ok,
    body: 'I noticed you installed it.',
  });
  const calendar = campaignDraftViolations({
    ...ok,
    body: 'Book https://calendly.com/brian',
  });
  const utm = campaignDraftViolations({
    ...ok,
    body: 'See https://hashbrown.dev/docs?utm_source=x',
  });
  const questions = campaignDraftViolations({ ...ok, body: 'Why? How?' });
  const words = campaignDraftViolations({
    ...ok,
    body: Array.from({ length: 121 }, () => 'word').join(' '),
  });
  const unapproved = campaignDraftViolations({
    ...ok,
    body: 'See https://example.com/page',
  });

  expect(surveillance).toContain('message contains surveillance language');
  expect(calendar).toContain('message contains a calendar link');
  expect(utm).toContain('message contains click-wrapper or pixel markup');
  expect(questions).toContain('body contains more than one question');
  expect(words).toContain('body exceeds 120 words');
  expect(unapproved).toContain('message contains an unapproved link');
});

test('normalizeCampaignDraft throws on a violation and trims a clean draft', () => {
  const clean = {
    subject: '  Hi  there ',
    body: ' line one \r\n\r\n\r\n\r\nline two ',
  };

  const normalized = normalizeCampaignDraft(clean);

  expect(normalized).toEqual({
    subject: 'Hi there',
    body: 'line one\n\nline two',
  });
  expect(() => normalizeCampaignDraft({ subject: '', body: 'x' })).toThrow(
    /subject is empty/u,
  );
});
