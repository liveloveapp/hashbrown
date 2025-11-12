import {
  normalizeFragments,
  parseMagicText,
  renderMagicText,
  type TextFragment,
  type CitationFragment,
} from './magic-text';

describe('parseMagicText', () => {
  it('parses emphasis markers into text fragments with marks', () => {
    const result = parseMagicText('We love **Angular** and _signals_.');

    const textFragments = result.fragments.filter(
      (f): f is TextFragment => f.kind === 'text',
    );

    expect(textFragments.map((f) => ({
      text: f.text,
      strong: Boolean(f.marks.strong),
      em: Boolean(f.marks.em),
      state: f.state,
    }))).toEqual([
      { text: 'We love ', strong: false, em: false, state: 'final' },
      { text: 'Angular', strong: true, em: false, state: 'final' },
      { text: ' and ', strong: false, em: false, state: 'final' },
      { text: 'signals', strong: false, em: true, state: 'final' },
      { text: '.', strong: false, em: false, state: 'final' },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('marks unfinished emphasis as provisional and emits a warning', () => {
    const result = parseMagicText('Hello **world');

    const provisional = result.fragments.find(
      (f): f is TextFragment => f.kind === 'text' && f.state === 'provisional',
    );

    expect(provisional?.text).toBe('**world');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { code: 'unterminated_construct', kind: 'strong', at: 6 },
      ]),
    );
  });

  it('parses links with titles and attribute lists', () => {
    const result = parseMagicText(
      'Check [docs](https://example.com "Docs"){alt="Docs", target="_self"}',
    );

    const linkFragment = result.fragments.find(
      (f): f is TextFragment => f.kind === 'text' && Boolean(f.marks.link),
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
    const result = parseMagicText('Avoid [this](javascript:alert(1)).');

    const warning = result.warnings.find((w) => w.code === 'disallowed_protocol');
    expect(warning).toBeDefined();

    const linkText = result.fragments
      .filter((f): f is TextFragment => f.kind === 'text')
      .map((f) => f.text)
      .join('');
    expect(linkText).toContain('this');
    expect(
      result.fragments.some(
        (f): f is TextFragment => f.kind === 'text' && Boolean(f.marks.link),
      ),
    ).toBe(false);
  });

  it('numbers citations and flags missing definitions', () => {
    const result = parseMagicText('Method [^foo] and [^bar].', {
      citations: [{ id: 'foo', text: 'Foo ref', href: 'https://example.com/foo' }],
    });

    const citations = result.fragments.filter(
      (f): f is CitationFragment => f.kind === 'citation',
    );

    expect(citations.map((c) => ({ id: c.citation.id, text: c.text }))).toEqual([
      { id: 'foo', text: '[1]' },
      { id: 'bar', text: '[2]' },
    ]);
    expect(result.meta.citationOrder).toEqual(['foo', 'bar']);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing_citation', id: 'bar' }),
      ]),
    );
  });

  it('splits grapheme units when requested', () => {
    const result = parseMagicText('👋🏽 hi', { unit: 'grapheme' });
    const ids = result.fragments
      .filter((f): f is TextFragment => f.kind === 'text')
      .map((f) => f.id);
    expect(ids.every((id) => id.startsWith('g:'))).toBe(true);
    expect(ids.length).toBeGreaterThan(2); // emoji + space + h + i
  });

  it('honors custom link policies that rewrite attributes', () => {
    const result = parseMagicText('See [docs](https://example.com)', {
      linkPolicy: (href) => ({ href: href.replace('https://', 'http://'), rel: 'nofollow' }),
    });

    const fragment = result.fragments.find(
      (f): f is TextFragment => f.kind === 'text' && Boolean(f.marks.link),
    );

    expect(fragment?.marks.link).toMatchObject({
      href: 'http://example.com',
      rel: 'nofollow',
      policy: 'rewritten',
    });
  });

  it('applies provisional policies during parsing', () => {
    const result = parseMagicText('Hello **world', {
      provisionalPolicy: 'whitespace-only',
    });

    expect(result.fragments.every((f) => f.state === 'final')).toBe(true);
  });

  it('normalizes fragments with whitespace splitting', () => {
    const result = parseMagicText('Link [here](https://example.com) next');
    const normalized = normalizeFragments(result, {
      provisionalPolicy: 'drop',
      splitWhitespace: true,
    }).filter((f): f is TextFragment => f.kind === 'text');

    const texts = normalized.map((f) => f.text);
    expect(texts.join('')).toBe('Link here next');
  });

  it('automatically inserts boundary whitespace when splitting', () => {
    const result = parseMagicText('See [docs](https://example.com) online');
    const normalized = normalizeFragments(result, {
      splitWhitespace: true,
    }).filter((f): f is TextFragment => f.kind === 'text');

    expect(normalized.map((f) => f.text).join('')).toBe('See docs online');
  });

  it('treats underscores inside emphasized words as literal characters', () => {
    const result = parseMagicText('Data from *fastfood_v2.csv* confirms trends.');
    const italic = result.fragments.find(
      (f): f is TextFragment => f.kind === 'text' && Boolean(f.marks.em),
    );

    expect(italic?.text).toBe('fastfood_v2.csv');
    const combined = result.fragments
      .filter((f): f is TextFragment => f.kind === 'text')
      .map((f) => f.text)
      .join('');
    expect(combined).toBe('Data from fastfood_v2.csv confirms trends.');
  });

  it('renders UI-friendly fragments with wrappers and whitespace hints', () => {
    const rendered = renderMagicText('See **bold** text and [links](https://example.com).');
    const fragments = rendered.fragments;
    const bold = fragments.find(
      (f): f is typeof f & { kind: 'text' } =>
        f.kind === 'text' && f.text === 'bold',
    );
    expect(bold?.wrappers).toEqual(['strong']);
    expect(bold?.whitespace.before).toBe(true);
    const link = fragments.find(
      (f) => f.kind === 'text' && f.marks.link,
    );
    expect(link?.whitespace.after).toBe(false);
    expect(link?.key).toBeDefined();
  });
});
