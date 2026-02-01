export const INCOMPLETE_LINK_HREF = 'hashbrown:incomplete-link';

export type InlineMarksExpectation = {
  strong?: boolean;
  em?: boolean;
  code?: boolean;
  linkHref?: string | undefined;
};

export type ExpectedFragment = {
  text: string;
  state: 'final' | 'provisional';
  marks?: InlineMarksExpectation;
};

export type InlineMarkdownCase = {
  name: string;
  input: string;
  expectedText: string;
  expectedFragments: ExpectedFragment[];
};

type NormalizedInlineMarksExpectation = {
  strong: boolean;
  em: boolean;
  code: boolean;
  linkHref?: string;
};

const DEFAULT_MARKS: NormalizedInlineMarksExpectation = {
  strong: false,
  em: false,
  code: false,
  linkHref: undefined,
};

export const withDefaultMarks = (
  marks?: InlineMarksExpectation,
): NormalizedInlineMarksExpectation => ({
  ...DEFAULT_MARKS,
  ...marks,
});

export const INLINE_MARKDOWN_CASES: InlineMarkdownCase[] = [
  {
    name: 'Test 1 — unterminated single-asterisk italic at end of stream',
    input: 'This is *italic',
    expectedText: 'This is italic',
    expectedFragments: [
      { text: 'This is ', state: 'final' },
      { text: 'italic', state: 'provisional', marks: { em: true } },
    ],
  },
  {
    name: 'Test 2 — unterminated single-asterisk italic in middle of paragraph',
    input: 'This is *italic and then some more text on the same line',
    expectedText: 'This is italic and then some more text on the same line',
    expectedFragments: [
      { text: 'This is ', state: 'final' },
      {
        text: 'italic and then some more text on the same line',
        state: 'provisional',
        marks: { em: true },
      },
    ],
  },
  {
    name: 'Test 3 — unterminated double-asterisk bold at end of stream',
    input: 'This is **bold',
    expectedText: 'This is bold',
    expectedFragments: [
      { text: 'This is ', state: 'final' },
      { text: 'bold', state: 'provisional', marks: { strong: true } },
    ],
  },
  {
    name: 'Test 4 — unterminated bold, followed by more paragraphs',
    input:
      'Intro line.\n\nHere is some **bold that never closes\nNext paragraph starts here.',
    expectedText:
      'Intro line.\n\nHere is some bold that never closes\nNext paragraph starts here.',
    expectedFragments: [
      { text: 'Intro line.\n\nHere is some ', state: 'final' },
      {
        text: 'bold that never closes\nNext paragraph starts here.',
        state: 'provisional',
        marks: { strong: true },
      },
    ],
  },
  {
    name: 'Test 5 — unterminated triple-asterisk bold+italic',
    input: 'This is ***very important',
    expectedText: 'This is very important',
    expectedFragments: [
      { text: 'This is ', state: 'final' },
      {
        text: 'very important',
        state: 'provisional',
        marks: { strong: true, em: true },
      },
    ],
  },
  {
    name: 'Test 6 — multiple incomplete emphasis regions',
    input: '*one *two **three',
    expectedText: '*one *two three',
    expectedFragments: [
      { text: '*one ', state: 'final' },
      { text: '*two ', state: 'final' },
      { text: 'three', state: 'provisional', marks: { strong: true } },
    ],
  },
  {
    name: 'Test 7 — stray closing marker with no opening',
    input: 'This line ends with a stray asterisk *',
    expectedText: 'This line ends with a stray asterisk *',
    expectedFragments: [
      { text: 'This line ends with a stray asterisk *', state: 'final' },
    ],
  },
  {
    name: 'Test 8 — mixed emphasis with one incomplete',
    input: 'This is *ok* but this **one is not',
    expectedText: 'This is ok but this one is not',
    expectedFragments: [
      { text: 'This is ', state: 'final' },
      { text: 'ok', state: 'final', marks: { em: true } },
      { text: ' but this ', state: 'final' },
      { text: 'one is not', state: 'provisional', marks: { strong: true } },
    ],
  },
  {
    name: 'Test 9 — unterminated inline code at end of line',
    input: 'Use `npm run dev',
    expectedText: 'Use npm run dev',
    expectedFragments: [
      { text: 'Use ', state: 'final' },
      { text: 'npm run dev', state: 'provisional', marks: { code: true } },
    ],
  },
  {
    name: 'Test 10 — unterminated inline code across newline',
    input: 'Use `npm run\ndev',
    expectedText: 'Use npm run\ndev',
    expectedFragments: [
      { text: 'Use ', state: 'final' },
      { text: 'npm run\ndev', state: 'provisional', marks: { code: true } },
    ],
  },
  {
    name: 'Test 11 — unterminated backtick in middle, closed later',
    input: 'Prefix `code snippet with no end',
    expectedText: 'Prefix code snippet with no end',
    expectedFragments: [
      { text: 'Prefix ', state: 'final' },
      {
        text: 'code snippet with no end',
        state: 'provisional',
        marks: { code: true },
      },
    ],
  },
  {
    name: 'Test 17 — incomplete link text only',
    input: 'Click [Profile',
    expectedText: 'Click Profile',
    expectedFragments: [
      { text: 'Click ', state: 'final' },
      {
        text: 'Profile',
        state: 'provisional',
        marks: { linkHref: INCOMPLETE_LINK_HREF },
      },
    ],
  },
  {
    name: 'Test 18 — incomplete link text at end of paragraph',
    input: 'You can find more details in [the docs',
    expectedText: 'You can find more details in the docs',
    expectedFragments: [
      { text: 'You can find more details in ', state: 'final' },
      {
        text: 'the docs',
        state: 'provisional',
        marks: { linkHref: INCOMPLETE_LINK_HREF },
      },
    ],
  },
  {
    name: 'Test 19 — incomplete link with closing bracket but no destination',
    input: 'See [the docs]',
    expectedText: 'See [the docs]',
    expectedFragments: [{ text: 'See [the docs]', state: 'final' }],
  },
  {
    name: 'Test 19b — balanced bracketed text stays literal without destination',
    input: 'Hashbrowns at [Waffle House]',
    expectedText: 'Hashbrowns at [Waffle House]',
    expectedFragments: [
      { text: 'Hashbrowns at [Waffle House]', state: 'final' },
    ],
  },
  {
    name: 'Test 20 — dangling opening parenthesis after link text',
    input: 'See [the docs](',
    expectedText: 'See [the docs](',
    expectedFragments: [
      { text: 'See ', state: 'final' },
      { text: '[the docs](', state: 'final' },
    ],
  },
  {
    name: 'Test 21 — incomplete URL in link destination',
    input: 'See [the docs](https://exampl',
    expectedText: 'See the docs',
    expectedFragments: [
      { text: 'See ', state: 'final' },
      {
        text: 'the docs',
        state: 'final',
        marks: { linkHref: INCOMPLETE_LINK_HREF },
      },
    ],
  },
  {
    name: 'Test 22 — properly completed link as control',
    input: 'See [the docs](https://example.com/docs)',
    expectedText: 'See the docs',
    expectedFragments: [
      { text: 'See ', state: 'final' },
      {
        text: 'the docs',
        state: 'final',
        marks: { linkHref: 'https://example.com/docs' },
      },
    ],
  },
  {
    name: 'Test 38 — unterminated inline math $...',
    input: 'The famous equation is $E = mc^2',
    expectedText: 'The famous equation is $E = mc^2',
    expectedFragments: [
      { text: 'The famous equation is $E = mc^2', state: 'final' },
    ],
  },
  {
    name: 'Test 40 — mixed emphasis, code, link, and incomplete bold',
    input:
      'This is **bold**, here is `code`, and here is [a link](https://example.com), but this one **never closes',
    expectedText:
      'This is bold, here is code, and here is a link, but this one never closes',
    expectedFragments: [
      { text: 'This is ', state: 'final' },
      { text: 'bold', state: 'final', marks: { strong: true } },
      { text: ', here is ', state: 'final' },
      { text: 'code', state: 'final', marks: { code: true } },
      { text: ', and here is ', state: 'final' },
      {
        text: 'a link',
        state: 'final',
        marks: { linkHref: 'https://example.com' },
      },
      { text: ', but this one ', state: 'final' },
      { text: 'never closes', state: 'provisional', marks: { strong: true } },
    ],
  },
  {
    name: 'Test 42 — unterminated inline code followed by unterminated bold',
    input: '`code without end and then **bold without end',
    expectedText: 'code without end and then **bold without end',
    expectedFragments: [
      {
        text: 'code without end and then **bold without end',
        state: 'provisional',
        marks: { code: true },
      },
    ],
  },
  {
    name: 'Test 44 — unterminated link and bold together',
    input: 'This is [a link and **bold',
    expectedText: 'This is a link and **bold',
    expectedFragments: [
      { text: 'This is ', state: 'final' },
      {
        text: 'a link and **bold',
        state: 'final',
        marks: { linkHref: INCOMPLETE_LINK_HREF },
      },
    ],
  },
  {
    name: 'Test 45 — arbitrary trailing punctuation after incomplete markers',
    input: 'This ends with * and then some stray text *',
    expectedText: 'This ends with * and then some stray text *',
    expectedFragments: [
      { text: 'This ends with * and then some stray text *', state: 'final' },
    ],
  },
  {
    name: 'Test 46 — balanced quesadilla stats stay scoped to inline marks',
    input:
      'The **Cantina Chicken Quesadilla** (_Quesadilla | Chicken | Entree_; 1 quesadilla_) remains a *balanced* standout: **41 g protein**, **740 calories**, and **1,470 mg sodium** per serving, grilled and served with Avocado Verde Salsa. It beats the **Nachos BellGrande® – Beef** (also 740 calories) on protein density. The latter’s **38 g fat** and generous **15 g fiber** illustrate its bean‑based bulk seen across [fiber‑rich fast-food options](/?prompt=high-fiber-nachos). [^3]',
    expectedText:
      'The Cantina Chicken Quesadilla (Quesadilla | Chicken | Entree; 1 quesadilla_) remains a balanced standout: 41 g protein, 740 calories, and 1,470 mg sodium per serving, grilled and served with Avocado Verde Salsa. It beats the Nachos BellGrande® – Beef (also 740 calories) on protein density. The latter’s 38 g fat and generous 15 g fiber illustrate its bean‑based bulk seen across fiber‑rich fast-food options. [1]',
    expectedFragments: [
      { text: 'The ', state: 'final' },
      {
        text: 'Cantina Chicken Quesadilla',
        state: 'final',
        marks: { strong: true },
      },
      { text: ' (', state: 'final' },
      {
        text: 'Quesadilla | Chicken | Entree',
        state: 'final',
        marks: { em: true },
      },
      { text: '; 1 quesadilla_) remains a ', state: 'final' },
      { text: 'balanced', state: 'final', marks: { em: true } },
      { text: ' standout: ', state: 'final' },
      {
        text: '41 g protein',
        state: 'final',
        marks: { strong: true },
      },
      { text: ', ', state: 'final' },
      {
        text: '740 calories',
        state: 'final',
        marks: { strong: true },
      },
      { text: ', and ', state: 'final' },
      {
        text: '1,470 mg sodium',
        state: 'final',
        marks: { strong: true },
      },
      {
        text: ' per serving, grilled and served with Avocado Verde Salsa. It beats the ',
        state: 'final',
      },
      {
        text: 'Nachos BellGrande® – Beef',
        state: 'final',
        marks: { strong: true },
      },
      {
        text: ' (also 740 calories) on protein density. The latter’s ',
        state: 'final',
      },
      {
        text: '38 g fat',
        state: 'final',
        marks: { strong: true },
      },
      { text: ' and generous ', state: 'final' },
      {
        text: '15 g fiber',
        state: 'final',
        marks: { strong: true },
      },
      {
        text: ' illustrate its bean‑based bulk seen across ',
        state: 'final',
      },
      {
        text: 'fiber‑rich fast-food options',
        state: 'final',
        marks: { linkHref: '/?prompt=high-fiber-nachos' },
      },
      { text: '. ', state: 'final' },
    ],
  },
];
