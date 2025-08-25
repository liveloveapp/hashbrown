import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
} from '@angular/core';
import {
  ApiExcerptToken,
  CanonicalReference,
} from '../models/api-report.models';
import { CodeHighlight } from '../pipes/CodeHighlight';
import { SymbolLink } from './SymbolLink';

@Component({
  selector: 'www-symbol-excerpt',
  imports: [CodeHighlight, forwardRef(() => SymbolLink)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="links">
      <!-- prettier-ignore -->
      @for (part of overlayParts(); track $index) {@if (part.kind === 'Text') {{{ part.text }}} @else if (part.kind === 'Reference') {<www-symbol-link [reference]="part.canonicalReference" class="reference" />}}
    </div>
    <div
      [class.deprecated]="deprecated()"
      [innerHTML]="contentToRender() | codeHighlight"
    ></div>
  `,
  styles: [
    `
      :host {
        position: relative;
        display: block;
      }

      .links,
      code {
        display: block;
        font:
          700 14px/1.5rem 'JetBrains Mono',
          monospace;
        font-variant-ligatures: none;
      }

      .links {
        position: absolute;
        color: transparent;
        white-space: pre;
      }

      .reference {
        text-decoration: underline;
        text-decoration-color: transparent;

        &:hover {
          text-decoration-color: #ffa657;
        }
      }

      .deprecated {
        text-decoration: line-through;
        font-style: italic;
        opacity: 0.72;
      }
    `,
  ],
})
export class SymbolExcerpt {
  excerptTokens = input.required<ApiExcerptToken[]>();
  deprecated = input<boolean>(false);
  formattedContent = input<string>('');
  private static readonly TEXT = 'Text' as const;
  private static readonly REFERENCE = 'Reference' as const;
  simplifiedExcerptTokens = computed(() => {
    return this.excerptTokens().map((token, index) => {
      if (index !== 0) return token;

      return {
        ...token,
        text: token.text
          .replace('export declare ', '')
          .replace('export type', 'type')
          .replace('export interface', 'interface'),
      };
    });
  });
  joinedContent = computed(() => {
    return this.simplifiedExcerptTokens()
      .map((token) => token.text)
      .join('');
  });
  contentToRender = computed(() => {
    const content = this.formattedContent();
    return content && content.trim().length > 0
      ? content
      : this.joinedContent();
  });
  overlayParts = computed(
    (): Array<
      | { kind: typeof SymbolExcerpt.TEXT; text: string }
      | {
          kind: typeof SymbolExcerpt.REFERENCE;
          text: string;
          canonicalReference: CanonicalReference;
        }
    > => {
      const content = this.contentToRender();
      if (!content) return [{ kind: SymbolExcerpt.TEXT, text: '' }];

      const references = this.simplifiedExcerptTokens().filter(
        (t) => t.kind === 'Reference',
      ) as Array<{
        kind: 'Reference';
        text: string;
        canonicalReference: CanonicalReference;
      }>;

      const parts: Array<
        | { kind: typeof SymbolExcerpt.TEXT; text: string }
        | {
            kind: typeof SymbolExcerpt.REFERENCE;
            text: string;
            canonicalReference: CanonicalReference;
          }
      > = [];

      let cursor = 0;
      for (const ref of references) {
        const needle = ref.text;
        if (!needle) continue;
        const match = this.findNextOccurrence(content, needle, cursor);
        if (!match) {
          return [{ kind: SymbolExcerpt.TEXT, text: content }];
        }

        if (match.start > cursor) {
          parts.push({
            kind: SymbolExcerpt.TEXT,
            text: content.slice(cursor, match.start),
          });
        }

        parts.push({
          kind: SymbolExcerpt.REFERENCE,
          text: content.slice(match.start, match.end),
          canonicalReference: ref.canonicalReference,
        });
        cursor = match.end;
      }

      if (cursor < content.length) {
        parts.push({ kind: SymbolExcerpt.TEXT, text: content.slice(cursor) });
      }

      return parts;
    },
  );

  private findNextOccurrence(
    haystack: string,
    needle: string,
    fromIndex: number,
  ): { start: number; end: number } | null {
    const isWs = (c: string) =>
      c === ' ' || c === '\n' || c === '\r' || c === '\t';
    let i = Math.max(0, fromIndex);
    const nlen = needle.length;
    if (nlen === 0) return null;

    while (i < haystack.length) {
      // advance to first potential match char
      while (i < haystack.length && haystack[i] !== needle[0]) {
        i++;
      }
      if (i >= haystack.length) break;
      const start = i;
      let j = 0;
      let k = i;
      while (k < haystack.length && j < nlen) {
        if (isWs(haystack[k])) {
          k++;
          continue;
        }
        if (haystack[k] !== needle[j]) {
          break;
        }
        k++;
        j++;
      }
      if (j === nlen) {
        return { start, end: k };
      }
      i = start + 1;
    }
    return null;
  }
}
