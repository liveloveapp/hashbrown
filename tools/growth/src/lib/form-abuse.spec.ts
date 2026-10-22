import { expect, test } from 'vitest';

import {
  assessFormAbuse,
  FORM_ABUSE_THRESHOLD,
  FORM_ABUSE_VERSION,
} from './form-abuse.ts';

test('the assessment version and threshold are fixed', () => {
  const version = FORM_ABUSE_VERSION;
  const threshold = FORM_ABUSE_THRESHOLD;

  const constants = { version, threshold };

  expect(constants).toEqual({ version: 'form-abuse-v1', threshold: 80 });
});

test('blocks combined random name and message signals', () => {
  const facts = {
    email: 'person@gmail.com',
    displayName: 'aBcDeFgHiJkLmNoP',
    message: 'qRsTuVwXyZaBcDeF',
    companyName: 'Zqxwy LLC',
  };

  const assessment = assessFormAbuse(facts);

  expect(assessment).toMatchObject({
    score: 100,
    decision: 'blocked',
    category: 'automated_form_spam',
    reasons: ['gibberish_name', 'gibberish_message', 'generated_company'],
  });
});

const legitimateFields = [
  {
    displayName: 'Christopher',
    message: 'Can you help us integrate Angular agents?',
    companyName: 'Acme LLC',
  },
  { displayName: '李明', message: '想了解你们的产品', companyName: '示例' },
  { displayName: 'McDonald', message: 'Hello', companyName: 'NASA' },
  {
    displayName: 'Jean-Baptiste Martin',
    message: 'Please send more information.',
    companyName: 'Test LLC',
  },
  {
    displayName: 'JOHNATHANSMITH',
    message: 'HelloWorldExample',
    companyName: 'ACME LLC',
  },
];

for (const fields of legitimateFields) {
  test(`allows legitimate short and international fields: ${fields.displayName}`, () => {
    const facts = { email: 'hello+demo@gmail.com', ...fields };

    const assessment = assessFormAbuse(facts);

    expect(assessment).toMatchObject({
      score: 0,
      decision: 'allow',
      category: 'normal',
    });
  });
}

test('keeps a single gibberish signal plus LLC below threshold', () => {
  const facts = {
    email: 'person@gmail.com',
    displayName: 'aBcDeFgHiJkLmNoP',
    companyName: 'Zqxwy LLC',
  };

  const assessment = assessFormAbuse(facts);

  expect(assessment).toMatchObject({
    score: 60,
    decision: 'allow',
    category: 'suspicious',
  });
});

test('blocks placeholder identities only with corroborating evidence', () => {
  const placeholder = { email: 'test@example.com' };

  const alone = assessFormAbuse(placeholder);
  const corroborated = assessFormAbuse({
    ...placeholder,
    rapidIdentityChange: true,
  });
  const withGibberishMessage = assessFormAbuse({
    ...placeholder,
    message: 'qRsTuVwXyZaBcDeFgHiJ',
  });
  const realBusiness = assessFormAbuse({ email: 'test@realbusiness.com' });

  expect(alone).toMatchObject({ score: 60, decision: 'allow' });
  expect(corroborated).toMatchObject({
    score: 80,
    decision: 'blocked',
    category: 'placeholder_email',
  });
  expect(withGibberishMessage).toMatchObject({
    score: 100,
    decision: 'blocked',
    category: 'placeholder_email',
  });
  expect(realBusiness).toMatchObject({ score: 0, decision: 'allow' });
});

test('blocks the honeypot alone and accepts submissions without it', () => {
  const email = 'person@gmail.com';

  const trapped = assessFormAbuse({ email, honeypot: 'https://bot.invalid' });
  const blank = assessFormAbuse({ email, honeypot: '  ' });

  expect(trapped).toMatchObject({
    score: 100,
    decision: 'blocked',
    category: 'honeypot',
  });
  expect(blank.decision).toBe('allow');
});
