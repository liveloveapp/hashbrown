import { prepareMagicText, type MagicTextFragment } from '@hashbrownai/core';

type MagicTextFragmentText = Extract<MagicTextFragment, { type: 'text' }>;

type WhitespacePosition = 'before' | 'after';

/**
 * Minimal re-implementation of the sample renderer's whitespace rules so we can
 * assert on the plain text value the component would produce in the DOM.
 */
function renderMagicText(text: string): string {
  const fragments = prepareMagicText(text).fragments;

  return fragments
    .map((fragment, index) => {
      const before = whitespaceContext(fragments, fragment, 'before', index);
      const after = whitespaceContext(fragments, fragment, 'after', index);
      const content =
        fragment.type === 'text'
          ? normalizeFragmentText(fragment)
          : fragment.text;

      return `${before.render ? ' ' : ''}${content}${after.render ? ' ' : ''}`;
    })
    .join('');
}

function whitespaceContext(
  fragments: MagicTextFragment[],
  fragment: MagicTextFragment,
  position: WhitespacePosition,
  index: number,
) {
  let render =
    position === 'before'
      ? fragment.renderWhitespace.before
      : fragment.renderWhitespace.after;

  if (position === 'before' && index === 0) {
    render = false;
  }

  const next = fragments[index + 1];

  const startsTight = (frag: MagicTextFragment | undefined): boolean =>
    frag?.type === 'text' && /^[,.;:!?|\)\]]/.test(frag.text.trim());

  const endsWithNoGap = (frag: MagicTextFragment | undefined): boolean =>
    frag?.type === 'text' && /([\(\|])$/.test(frag.text.trim());

  if (position === 'before' && startsTight(fragment)) {
    render = false;
  }

  if (position === 'after' && startsTight(next)) {
    render = false;
  }

  if (position === 'after' && endsWithNoGap(fragment)) {
    render = false;
  }

  return { position, render, fragment, index };
}

function normalizeFragmentText(fragment: MagicTextFragmentText): string {
  if (fragment.isCode) {
    return fragment.text;
  }

  let text = fragment.text.replace(/[\u00a0\u202f]/g, ' ');
  text = text.replace(/^\s+/, '').replace(/\s+$/, '');

  if (fragment.renderWhitespace.before) {
    text = text.replace(/^\s+/, '');
  }

  if (fragment.renderWhitespace.after) {
    text = text.replace(/\s+$/, '');
  }

  // Collapse stray spaces around punctuation and multiple runs
  text = text
    .replace(/\s+([,.;:!?\\)])/g, '$1')
    .replace(/([\(])\s+/g, '$1')
    .replace(/\s+\)/g, ')')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+(\d)/g, ' $1')
    .replace(/\s+([\u2014\-])\s+/g, ' $1 ')
    .replace(/\s+/g, ' ');

  return text;
}

describe('MagicTextRenderer whitespace (sample app)', () => {
  it('keeps the space before inline links intact', () => {
    const rendered = renderMagicText(
      'Visit [Subway wraps](/wraps), high protein.',
    );

    expect(rendered).toBe('Visit Subway wraps, high protein.');
  });

  it('keeps punctuation tight after linked text', () => {
    const rendered = renderMagicText('Tight [link](/foo)!');

    expect(rendered).toBe('Tight link!');
  });

  it('preserves spacing around citations following links', () => {
    const rendered = renderMagicText('Numbers [link](/foo)[^1] still tight.');

    expect(rendered).toBe('Numbers link[1] still tight.');
  });

  it('normalizes whitespace in the Taco Bell summary sentence', () => {
    const rendered = renderMagicText(
      'Among the current Taco Bell favorites, the [Cinnabon Delights 12 Pack](/items/cinnabon-delights) reaches 930 calories, 53 g fat, and 59 g sugar, yet only 9 g protein. [^1]',
    );

    expect(rendered).toBe(
      'Among the current Taco Bell favorites, the Cinnabon Delights 12 Pack reaches 930 calories, 53 g fat, and 59 g sugar, yet only 9 g protein. [1]',
    );
  });

  it('keeps a space before citations after italic text', () => {
    const rendered = renderMagicText('Finish with *italic* note [^2].');

    expect(rendered).toBe('Finish with italic note [1].');
  });

  it('keeps a space before citations after bold text', () => {
    const rendered = renderMagicText('Finish with **bold** statement [^3].');

    expect(rendered).toBe('Finish with bold statement [1].');
  });

  it('keeps a space before citations after linked text', () => {
    const rendered = renderMagicText('Link first [anchor](/a) then cite [^4].');

    expect(rendered).toBe('Link first anchor then cite [1].');
  });
});
