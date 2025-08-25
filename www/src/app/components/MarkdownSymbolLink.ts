import { Component, Input, ViewEncapsulation } from '@angular/core';
import { CanonicalReference } from '../models/api-report.models';
import { SymbolLink } from './SymbolLink';

@Component({
  imports: [SymbolLink],
  template: ` <www-symbol-link [reference]="reference" /> `,
  encapsulation: ViewEncapsulation.None,
  styles: [
    `
      hb-markdown-symbol-link a {
        color: var(--sky-blue-dark, #64afb5);
        font:
          700 14px/21px 'JetBrains Mono',
          monospace;
        text-decoration: underline !important;
        text-decoration-style: solid;
        text-decoration-thickness: 1px;
        text-underline-offset: 2px;
      }
    `,
  ],
})
export class MarkdownSymbolLink {
  @Input() reference: CanonicalReference = '@hashbrownai/core!Component:type';
}
