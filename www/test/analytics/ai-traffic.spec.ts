import { expect, test } from 'vitest';
import {
  buildCapturePayload,
  classifyAiCrawler,
  classifyAiReferrer,
  classifyRequest,
  createEmissionBudget,
  EMISSION_BUCKET_CAPACITY,
  shouldEmitCrawlerEvent,
  takeEmissionToken,
} from '../../src/lib/analytics/ai-traffic';

test('classifies known AI crawlers by longest token first', () => {
  const agents = [
    'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    'Mozilla/5.0 (compatible; OAI-SearchBot/1.0)',
    'Mozilla/5.0 AppleWebKit/605.1.15 (Applebot-Extended/0.1)',
    'Mozilla/5.0 (compatible; Googlebot/2.1)',
    'Claude-Web/1.0',
    '',
    null,
  ];

  const slugs = agents.map((agent) => classifyAiCrawler(agent));

  expect(slugs).toEqual([
    'gptbot',
    'oai-searchbot',
    'applebot-extended',
    null,
    'claude-web',
    null,
    null,
  ]);
});

test('classifies referrers by exact host or subdomain', () => {
  const referrers = [
    'https://chatgpt.com/c/1',
    'https://www.perplexity.ai/search?q=x',
    'https://chat.openai.com/',
    'https://claude.ai.attacker.net/',
    'https://evil-chatgpt.com/',
    'ftp://claude.ai/',
    'not a url',
    null,
  ];

  const slugs = referrers.map((referrer) => classifyAiReferrer(referrer));

  expect(slugs).toEqual([
    'chatgpt',
    'perplexity',
    'chatgpt',
    null,
    null,
    null,
    null,
    null,
  ]);
});

test('deduplicates crawler events per crawler, path and hour and caps keys at 2000', () => {
  const seen = new Set<string>();
  const hour = 60 * 60 * 1000;

  const first = shouldEmitCrawlerEvent({
    crawler: 'gptbot',
    path: '/a',
    now: 0,
    seen,
  });
  const repeat = shouldEmitCrawlerEvent({
    crawler: 'gptbot',
    path: '/a',
    now: 1000,
    seen,
  });
  const nextHour = shouldEmitCrawlerEvent({
    crawler: 'gptbot',
    path: '/a',
    now: hour,
    seen,
  });
  for (let i = 0; i < 2500; i += 1) {
    shouldEmitCrawlerEvent({ crawler: 'ccbot', path: `/p/${i}`, now: 0, seen });
  }

  expect([first, repeat, nextHour]).toEqual([true, false, true]);
  expect(seen.size).toBeLessThanOrEqual(2000);
  const newest = shouldEmitCrawlerEvent({
    crawler: 'ccbot',
    path: '/p/2499',
    now: 0,
    seen,
  });
  const oldest = shouldEmitCrawlerEvent({
    crawler: 'ccbot',
    path: '/p/0',
    now: 0,
    seen,
  });
  const middle = shouldEmitCrawlerEvent({
    crawler: 'ccbot',
    path: '/p/1000',
    now: 0,
    seen,
  });
  expect(newest).toBe(false);
  expect(oldest).toBe(true);
  expect(middle).toBe(false);
});

test('token bucket refuses the 501st emission in an hour', () => {
  const budget = createEmissionBudget(0);

  const results = Array.from({ length: EMISSION_BUCKET_CAPACITY + 1 }, () =>
    takeEmissionToken(budget, 0),
  );

  expect(results.slice(0, EMISSION_BUCKET_CAPACITY).every(Boolean)).toBe(true);
  expect(results[EMISSION_BUCKET_CAPACITY]).toBe(false);
  expect(takeEmissionToken(budget, 60 * 60 * 1000)).toBe(true);
});

test('payload carries no person profile, no ip, and the middleware lib tag', () => {
  const capture = {
    event: 'marketing:ai_referral_visit',
    distinctId: 'ai_referral:claude',
    properties: { ai_source: 'claude', source_page: '/docs' },
  } as const;

  const payload = buildCapturePayload(
    capture,
    'phc_test',
    '2026-10-21T00:00:00.000Z',
  );

  expect(payload).toEqual({
    api_key: 'phc_test',
    event: 'marketing:ai_referral_visit',
    distinct_id: 'ai_referral:claude',
    timestamp: '2026-10-21T00:00:00.000Z',
    properties: {
      ai_source: 'claude',
      source_page: '/docs',
      $process_person_profile: false,
      $ip: null,
      $lib: 'hashbrown-website-middleware',
    },
  });
});

test('classifyRequest emits the right event shape for each kind of visit', () => {
  const longAgent = `GPTBot/1.2 ${'x'.repeat(400)}`;
  const base = { path: '/docs', now: 0 };
  const run = (userAgent: string | null, referrer: string | null) =>
    classifyRequest({
      ...base,
      userAgent,
      referrer,
      seen: new Set<string>(),
      budget: createEmissionBudget(0),
    });

  const referral = run('Mozilla/5.0 Safari', 'https://chatgpt.com/c/1');
  const crawler = run(longAgent, null);
  const both = run(longAgent, 'https://chatgpt.com/c/1');
  const plain = run('Mozilla/5.0 Safari', 'https://example.com/');

  expect(referral?.event).toBe('marketing:ai_referral_visit');
  expect(referral?.properties).not.toHaveProperty('user_agent');
  expect(crawler?.properties.user_agent).toHaveLength(200);
  expect(both?.event).toBe('marketing:ai_crawler_visit');
  expect(plain).toBeNull();
});

test('classifyRequest redacts email addresses from the crawler user agent', () => {
  const userAgent =
    'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)';

  const crawler = classifyRequest({
    path: '/docs',
    now: 0,
    userAgent,
    referrer: null,
    seen: new Set<string>(),
    budget: createEmissionBudget(0),
  });

  expect(crawler?.properties).toMatchObject({
    ai_crawler: 'bytespider',
    user_agent:
      'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; [email])',
  });
});
