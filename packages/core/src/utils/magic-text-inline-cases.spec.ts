/* eslint-disable no-useless-escape */
import {
  INLINE_MARKDOWN_CASES,
  withDefaultMarks,
} from './magic-text-inline-cases';
import {
  type MagicTextFragment,
  type MagicTextFragmentText,
  prepareMagicText,
} from './magic-text';

type Position = 'before' | 'after';

const BALANCED_QSR_CASE = INLINE_MARKDOWN_CASES.find((testCase) =>
  testCase.name.includes('balanced quesadilla stats'),
);

describe('prepareMagicText inline cases', () => {
  if (BALANCED_QSR_CASE) {
    it('renders menu breakdown with expected whitespace', () => {
      expect(renderMagicText(BALANCED_QSR_CASE.input)).toBe(
        BALANCED_QSR_CASE.expectedText,
      );
    });
  }

  it.each(INLINE_MARKDOWN_CASES)(
    '$name maps fragments and marks',
    (testCase) => {
      const fragments = prepareMagicText(testCase.input).fragments.filter(
        (fragment): fragment is MagicTextFragmentText =>
          fragment.type === 'text',
      );

      expect(fragments).toHaveLength(testCase.expectedFragments.length);

      fragments.forEach((fragment, index) => {
        const expected = testCase.expectedFragments[index];
        expect(fragment.text).toBe(expected.text);
        expect(fragment.state).toBe(expected.state);
        expect(normalizeMarks(fragment)).toEqual(
          withDefaultMarks(expected.marks),
        );
      });
    },
  );
});

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
    frag?.type === 'text' && /^[,.;:!?|)\]]/.test(frag.text.trim());

  const endsWithNoGap = (frag: MagicTextFragment | undefined): boolean =>
    frag?.type === 'text' && /([(|])$/.test(frag.text.trim());

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
    .replace(/\s+([,.;:!?\)])/g, '$1')
    .replace(/([\(])\s+/g, '$1')
    .replace(/\s+\)/g, ')')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+(\d)/g, ' $1')
    .replace(/\s+([\u2014\-])\s+/g, ' $1 ')
    .replace(/\s+/g, ' ');
}

function normalizeMarks(fragment: MagicTextFragmentText) {
  return {
    strong: Boolean(fragment.marks.strong),
    em: Boolean(fragment.marks.em),
    code: Boolean(fragment.marks.code),
    linkHref: fragment.marks.link?.href,
  };
}
