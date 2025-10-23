import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
} from '@angular/core';
import { NgClass } from '@angular/common';
import {
  ApiExcerptToken,
  ApiExcerptTokenKind,
} from '../models/api-report.models';
import { CodeHighlight } from '../pipes/CodeHighlight';
import { SymbolLink } from './SymbolLink';

@Component({
  selector: 'www-symbol-excerpt',
  imports: [CodeHighlight, forwardRef(() => SymbolLink), NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- <div class="links"> -->
    <!-- prettier-ignore -->
    <!-- @for (token of overlayTokens(); track $index) {@if (token.kind === apiExcerptTokenKind.Content) {{{ token.text }}} @else if (token.kind === apiExcerptTokenKind.Reference) {<www-symbol-link [reference]="token.canonicalReference" [text]="token.text" class="reference" />}} -->
    <!-- </div> -->
    @if (formattedContent()) {
      <div
        [class.deprecated]="deprecated()"
        [innerHTML]="formattedContent() | codeHighlight"
      ></div>
    } @else if (excerptTokens().length > 0) {
      <div
        [ngClass]="{ deprecated: deprecated() }"
        [innerHTML]="joinedContent() | codeHighlight"
      ></div>
    }
  `,
  styles: `
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
      color: white;
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
})
export class SymbolExcerpt {
  excerptTokens = input.required<ApiExcerptToken[]>();
  deprecated = input<boolean>(false);
  formattedContent = input<string>('');
  overlayTokens = input<ApiExcerptToken[] | null>(null);

  apiExcerptTokenKind = ApiExcerptTokenKind;

  joinedContent = computed(() => {
    return this.excerptTokens()
      .map((token) =>
        token.text
          .replace('export declare ', '')
          .replace('export type', 'type')
          .replace('export interface', 'interface'),
      )
      .join('');
  });
}
