import {
  INCOMPLETE_LINK_HREF,
  INLINE_MARKDOWN_CASES,
  withDefaultMarks,
} from './magic-text-inline-cases';
import { type MagicTextFragment, prepareMagicText } from './magic-text';

type TextFragment = Extract<MagicTextFragment, { type: 'text' }>;
type CitationFragment = Extract<MagicTextFragment, { type: 'citation' }>;

const isTextFragment = (
  fragment: MagicTextFragment,
): fragment is TextFragment => fragment.type === 'text';

const isCitationFragment = (
  fragment: MagicTextFragment,
): fragment is CitationFragment => fragment.type === 'citation';

type PrepareMagicTextResult = ReturnType<typeof prepareMagicText>;

const textFragmentsFrom = (result: PrepareMagicTextResult) =>
  result.fragments.filter(isTextFragment);

const combinedTextFrom = (result: PrepareMagicTextResult) =>
  textFragmentsFrom(result)
    .map((fragment) => fragment.text)
    .join('');

type TextFragmentSummary = {
  text: string;
  state: 'final' | 'provisional';
  marks: {
    strong: boolean;
    em: boolean;
    code: boolean;
    linkHref: string | undefined;
  };
};

const summarizeTextFragments = (
  result: PrepareMagicTextResult,
): TextFragmentSummary[] =>
  textFragmentsFrom(result).map((fragment) => ({
    text: fragment.text,
    state: fragment.state,
    marks: {
      strong: Boolean(fragment.marks.strong),
      em: Boolean(fragment.marks.em),
      code: Boolean(fragment.marks.code),
      linkHref: fragment.marks.link?.href,
    },
  }));

describe('prepareMagicText', () => {
  it('parses emphasis markers into text fragments with marks', () => {
    const result = prepareMagicText('We love **Angular** and _signals_.');

    const textFragments = result.fragments.filter(isTextFragment);

    expect(
      textFragments.map((f) => ({
        text: f.text,
        strong: Boolean(f.marks.strong),
        em: Boolean(f.marks.em),
        state: f.state,
      })),
    ).toEqual([
      { text: 'We love ', strong: false, em: false, state: 'final' },
      { text: 'Angular', strong: true, em: false, state: 'final' },
      { text: ' and ', strong: false, em: false, state: 'final' },
      { text: 'signals', strong: false, em: true, state: 'final' },
      { text: '.', strong: false, em: false, state: 'final' },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('soft-closes unfinished emphasis as provisional formatting', () => {
    const result = prepareMagicText('Hello **world');

    const provisional = result.fragments.find(
      (f): f is TextFragment => isTextFragment(f) && f.state === 'provisional',
    );

    expect(provisional?.text).toBe('world');
    expect(provisional?.marks.strong).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('parses links with titles and attribute lists', () => {
    const result = prepareMagicText(
      'Check [docs](https://example.com "Docs"){alt="Docs", target="_self"}',
    );

    const linkFragment = result.fragments.find(
      (f): f is TextFragment => isTextFragment(f) && Boolean(f.marks.link),
    );

    expect(linkFragment?.text).toBe('docs');
    expect(linkFragment?.marks.link).toMatchObject({
      href: 'https://example.com',
      title: 'Docs',
      ariaLabel: 'Docs',
      target: '_self',
      policy: 'allowed',
    });
  });

  it('drops disallowed protocols but keeps the label text', () => {
    const result = prepareMagicText('Avoid [this](javascript:alert(1)).');

    const warning = result.warnings.find(
      (w) => w.code === 'disallowed_protocol',
    );
    expect(warning).toBeDefined();

    const linkText = result.fragments
      .filter(isTextFragment)
      .map((f) => f.text)
      .join('');
    expect(linkText).toContain('this');
    expect(
      result.fragments.some((f) => isTextFragment(f) && Boolean(f.marks.link)),
    ).toBe(false);
  });

  it('numbers citations in order without requiring metadata', () => {
    const result = prepareMagicText('Method [^foo] and [^bar].');

    const citations = result.fragments.filter(isCitationFragment);

    expect(citations.map((c) => ({ id: c.citation.id, text: c.text }))).toEqual(
      [
        { id: 'foo', text: '[1]' },
        { id: 'bar', text: '[2]' },
      ],
    );
    expect(result.meta.citationOrder).toEqual(['foo', 'bar']);
    expect(result.warnings).toEqual([]);
  });

  it('emits citation fragments even before their metadata arrives', () => {
    const optimistic = prepareMagicText('Pending cite [^99] incoming.');
    const optimisticCitation = optimistic.fragments.find(isCitationFragment);

    expect(optimisticCitation?.citation).toMatchObject({
      id: '99',
    });
    expect(optimistic.warnings).toEqual([]);
  });

  it('splits grapheme units when requested', () => {
    const result = prepareMagicText('👋🏽 hi', { unit: 'grapheme' });
    const ids = result.fragments.filter(isTextFragment).map((f) => f.id);
    expect(ids.every((id) => id.startsWith('g:'))).toBe(true);
    expect(ids.length).toBeGreaterThan(2); // emoji + space + h + i
  });

  it('honors custom link policies that rewrite attributes', () => {
    const result = prepareMagicText('See [docs](https://example.com)', {
      linkPolicy: (href) => ({
        href: href.replace('https://', 'http://'),
        rel: 'nofollow',
      }),
    });

    const fragment = result.fragments.find(
      (f): f is TextFragment => isTextFragment(f) && Boolean(f.marks.link),
    );

    expect(fragment?.marks.link).toMatchObject({
      href: 'http://example.com',
      rel: 'nofollow',
      policy: 'rewritten',
    });
  });

  it('preserves whitespace immediately following links', () => {
    const result = prepareMagicText('Check [docs](https://example.com) later.');

    const textFragments = result.fragments.filter(isTextFragment);

    const afterLink = textFragments.find((fragment, index) =>
      Boolean(index > 0 && textFragments[index - 1]?.marks.link),
    );

    expect(afterLink?.text.startsWith(' ')).toBe(true);
  });

  it('parses inline code spans delimited by backticks', () => {
    const result = prepareMagicText('Run `npm run test` soon.');

    const codeFragment = result.fragments.find(
      (f): f is TextFragment => isTextFragment(f) && Boolean(f.marks.code),
    );

    expect(codeFragment).toBeDefined();
    expect(codeFragment?.text).toBe('npm run test');
    expect(codeFragment?.marks.strong).toBeUndefined();
  });

  it('treats underscores inside emphasized words as literal characters', () => {
    const result = prepareMagicText(
      'Data from *fastfood_v2.csv* confirms trends.',
    );
    const italic = result.fragments.find(
      (f): f is TextFragment => isTextFragment(f) && Boolean(f.marks.em),
    );

    expect(italic?.text).toBe('fastfood_v2.csv');
    const combined = result.fragments
      .filter(isTextFragment)
      .map((f) => f.text)
      .join('');
    expect(combined).toBe('Data from fastfood_v2.csv confirms trends.');
  });

  it('renders UI-friendly fragments with wrappers and whitespace hints', () => {
    const rendered = prepareMagicText(
      'See **bold** text and [links](https://example.com).',
    );
    const fragments = rendered.fragments;
    const bold = fragments.find(
      (f): f is TextFragment => isTextFragment(f) && f.text === 'bold',
    );
    expect(bold?.wrappers).toEqual(['strong']);
    expect(bold?.whitespace.before).toBe(true);
    const link = fragments.find(
      (f): f is TextFragment => isTextFragment(f) && Boolean(f.marks.link),
    );
    expect(link?.whitespace.after).toBe(false);
    expect(link?.key).toBeDefined();
  });

  it('keeps provisional fragments styled while awaiting completion', () => {
    const rendered = prepareMagicText('Hello **world');
    const provisional = rendered.fragments.find(
      (f): f is TextFragment => isTextFragment(f) && f.state === 'provisional',
    );

    expect(provisional?.text).toBe('world');
    expect(provisional?.marks.strong).toBe(true);
  });

  it('emits stable fragment ids as text grows', () => {
    const first = prepareMagicText('Streaming output');
    const next = prepareMagicText('Streaming output is great');

    const firstText = first.fragments.find(isTextFragment);
    const nextText = next.fragments.find(isTextFragment);

    expect(firstText?.id).toBe(nextText?.id);
  });

  describe('inline markdown recovery cases', () => {
    it.each(INLINE_MARKDOWN_CASES)(
      '$name',
      ({ input, expectedText, expectedFragments }) => {
        const result = prepareMagicText(input);

        expect(combinedTextFrom(result)).toBe(expectedText);
        expect(result.warnings).toEqual([]);

        const summary = summarizeTextFragments(result);
        expect(summary).toHaveLength(expectedFragments.length);

        summary.forEach((fragment, index) => {
          const expected = expectedFragments[index];
          expect(fragment.text).toBe(expected.text);
          expect(fragment.state).toBe(expected.state);
          expect(fragment.marks).toEqual(withDefaultMarks(expected.marks));
        });
      },
    );
  });
});
