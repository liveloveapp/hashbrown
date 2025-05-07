import { NgClass } from '@angular/common';
import { Component, computed, forwardRef, input } from '@angular/core';
import { ApiExcerptToken } from '../models/api-report.models';
import { CodeHighlight } from '../pipes/CodeHighlight';
import { SymbolLink } from './SymbolLink';

@Component({
  selector: 'www-symbol-excerpt',
  imports: [CodeHighlight, NgClass, forwardRef(() => SymbolLink)],
  template: `
    <div class="links">
      <!-- prettier-ignore -->
      @for (excerpt of simplifiedExcerptTokens(); track $index) {@if (excerpt.kind === 'Content') {{{ excerpt.text }}} @else if (excerpt.kind === 'Reference') {<www-symbol-link [reference]="excerpt.canonicalReference" />}}
    </div>
    <div
      [ngClass]="{ deprecated: deprecated() }"
      [innerHTML]="joinedContent() | codeHighlight"
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
        font: 500 14px/1.5rem monospace;
        font-variant-ligatures: none;
      }

      .links {
        position: absolute;
        color: transparent;
        white-space: pre;
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
}
