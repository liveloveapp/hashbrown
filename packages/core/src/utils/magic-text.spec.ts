import { type MagicTextFragment, prepareMagicText } from './magic-text';

type TextFragment = Extract<MagicTextFragment, { type: 'text' }>;
type CitationFragment = Extract<MagicTextFragment, { type: 'citation' }>;

const isTextFragment = (
  fragment: MagicTextFragment,
): fragment is TextFragment => fragment.type === 'text';

const isCitationFragment = (
  fragment: MagicTextFragment,
): fragment is CitationFragment => fragment.type === 'citation';

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

  it('marks unfinished emphasis as provisional and emits a warning', () => {
    const result = prepareMagicText('Hello **world');

    const provisional = result.fragments.find(
      (f): f is TextFragment => isTextFragment(f) && f.state === 'provisional',
    );

    expect(provisional?.text).toBe('**world');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { code: 'unterminated_construct', kind: 'strong', at: 6 },
      ]),
    );
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

  it('numbers citations and flags missing definitions', () => {
    const result = prepareMagicText('Method [^foo] and [^bar].', {
      citations: [
        { id: 'foo', text: 'Foo ref', href: 'https://example.com/foo' },
      ],
    });

    const citations = result.fragments.filter(isCitationFragment);

    expect(citations.map((c) => ({ id: c.citation.id, text: c.text }))).toEqual(
      [
        { id: 'foo', text: '[1]' },
        { id: 'bar', text: '[2]' },
      ],
    );
    expect(result.meta.citationOrder).toEqual(['foo', 'bar']);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing_citation', id: 'bar' }),
      ]),
    );
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

  it('keeps provisional fragments visible when rendering', () => {
    const rendered = prepareMagicText('Hello **world');
    const provisional = rendered.fragments.find(
      (f): f is TextFragment => isTextFragment(f) && f.state === 'provisional',
    );

    expect(provisional?.text).toContain('world');
  });

  it('emits stable fragment ids as text grows', () => {
    const first = prepareMagicText('Streaming output');
    const next = prepareMagicText('Streaming output is great');

    const firstText = first.fragments.find(isTextFragment);
    const nextText = next.fragments.find(isTextFragment);

    expect(firstText?.id).toBe(nextText?.id);
  });
});
