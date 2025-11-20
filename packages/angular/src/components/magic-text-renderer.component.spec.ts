/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { type MagicTextFragment } from '@hashbrownai/core';
import {
  INLINE_MARKDOWN_CASES,
  withDefaultMarks,
} from './magic-text-inline-cases';
import { type MagicTextFragmentText } from '@hashbrownai/core';
import { MagicText, MagicTextCitation } from './magic-text-renderer.component';

vi.mock('@hashbrownai/core', async (importOriginal) => {
  const actual = await importOriginal();
  return actual;
});

function renderComponent(
  input: string,
  citations?: MagicTextCitation[],
): {
  fixture: ReturnType<(typeof TestBed)['createComponent']>;
  fragments: MagicTextFragment[];
  component: MagicText & {
    fragments(): MagicTextFragment[];
  };
  innerText: string;
} {
  TestBed.configureTestingModule({
    imports: [MagicText],
  });

  const fixture = TestBed.createComponent(MagicText);
  const component = fixture.componentInstance as MagicText & {
    fragments(): MagicTextFragment[];
  };

  fixture.componentRef.setInput('text', input);
  if (citations !== undefined) {
    fixture.componentRef.setInput('citations', citations);
  }
  fixture.detectChanges();

  const fragments: MagicTextFragment[] = (component as any).fragments();
  const host = fixture.nativeElement as HTMLElement;
  const innerText =
    (host as HTMLElement & { innerText?: string }).innerText ??
    host.textContent ??
    '';

  return { fixture, component, fragments, innerText: innerText.trim() };
}

function normalizeMarks(fragment: MagicTextFragmentText) {
  return {
    strong: Boolean(fragment.marks.strong),
    em: Boolean(fragment.marks.em),
    code: Boolean(fragment.marks.code),
    linkHref: fragment.marks.link?.href,
  };
}

describe('MagicText whitespace', () => {
  it('renders punctuation and citations without stray spaces', () => {
    const input =
      'Among the current Taco Bell favorites, the [Cinnabon Delights 12 Pack](/items/cinnabon-delights) reaches 930 calories, 53 g fat, and 59 g sugar, yet only 9 g protein. [^1]';

    expect(renderComponent(input).innerText).toBe(
      'Among the current Taco Bell favorites, the Cinnabon Delights 12 Pack reaches 930 calories, 53 g fat, and 59 g sugar, yet only 9 g protein. [1]',
    );
  });

  it('keeps inline punctuation and citation tight for rich menu description', () => {
    const input =
      "Five of the richest items in Taco Bell's lineup combine breakfast, entrée, and dessert specialties. The **Cinnabon Delights® 12 Pack** (12 pieces; _Dessert, Vegetarian_) contributes **930 calories**, **53 g fat**, and **59 g sugar**, far exceeding most Taco Bell sides. Audited on 2025-11-10, its [official listing](/?prompt=cinnabon-delights-nutrition-overview) remains a key dessert benchmark. [^1]";
    const expected =
      "Five of the richest items in Taco Bell's lineup combine breakfast, entrée, and dessert specialties. The Cinnabon Delights® 12 Pack (12 pieces; Dessert, Vegetarian) contributes 930 calories, 53 g fat, and 59 g sugar, far exceeding most Taco Bell sides. Audited on 2025-11-10, its official listing remains a key dessert benchmark. [1]";

    expect(renderComponent(input).innerText).toBe(expected);
  });
});

describe('MagicText inline markdown parsing', () => {
  it.each(INLINE_MARKDOWN_CASES)('$name renders expected text', (testCase) => {
    const { innerText } = renderComponent(testCase.input);

    expect(innerText).toBe(testCase.expectedText);
  });

  it.each(INLINE_MARKDOWN_CASES)(
    '$name maps fragments and marks',
    (testCase) => {
      const { fragments } = renderComponent(testCase.input);
      const textFragments = fragments.filter(
        (frag): frag is MagicTextFragmentText => frag.type === 'text',
      );

      expect(textFragments).toHaveLength(testCase.expectedFragments.length);

      textFragments.forEach((fragment, index) => {
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
