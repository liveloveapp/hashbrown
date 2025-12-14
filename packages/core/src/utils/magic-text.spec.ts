/* eslint-disable no-useless-escape */
import { type MagicTextFragment, prepareMagicText } from './magic-text';

type Position = 'before' | 'after';

// Mirrors the Angular renderer's whitespace and normalization logic to produce
// the final plain text seen by users.
function renderMagicText(input: string): string {
  const fragments = prepareMagicText(input).fragments;

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
  position: Position,
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

function normalizeFragmentText(
  fragment: Extract<MagicTextFragment, { type: 'text' }>,
) {
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

  return text
    .replace(/\s+([,.;:!?\\)])/g, '$1')
    .replace(/([\(])\s+/g, '$1')
    .replace(/\s+\)/g, ')')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+(\d)/g, ' $1')
    .replace(/\s+([\u2014\-])\s+/g, ' $1 ')
    .replace(/\s+/g, ' ');
}

describe('prepareMagicText whitespace', () => {
  it('keeps space before citations and tight punctuation around links', () => {
    const input =
      'Among the current Taco Bell favorites, the [Cinnabon Delights 12 Pack](/items/cinnabon-delights) reaches 930 calories, 53 g fat, and 59 g sugar, yet only 9 g protein. [^1]';

    expect(renderMagicText(input)).toBe(
      'Among the current Taco Bell favorites, the Cinnabon Delights 12 Pack reaches 930 calories, 53 g fat, and 59 g sugar, yet only 9 g protein. [1]',
    );
  });

  it('retains spaces before citations after italic text', () => {
    const input = 'Finish with *italic* note [^2].';

    expect(renderMagicText(input)).toBe('Finish with italic note [1].');
  });

  it('retains spaces before citations after bold text', () => {
    const input = 'Finish with **bold** statement [^3].';

    expect(renderMagicText(input)).toBe('Finish with bold statement [1].');
  });

  it('retains spaces before citations after linked text', () => {
    const input = 'Link first [anchor](/a) then cite [^4].';

    expect(renderMagicText(input)).toBe('Link first anchor then cite [1].');
  });
});
