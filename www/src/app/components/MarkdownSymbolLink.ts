import { Component, Input, ViewEncapsulation } from '@angular/core';
import { CanonicalReference } from '../models/api-report.models';
import { SymbolLink } from './SymbolLink';

@Component({
  imports: [SymbolLink],
  template: ` <www-symbol-link [reference]="reference" /> `,
  encapsulation: ViewEncapsulation.None,
  styles: [
    `
      www-markdown-symbol-link a {
        background: rgba(158, 207, 215, 0.56);
        color: #fff;
        padding: 3px 6px;
        border-radius: 4px;
        font-family: 'Operator Mono', monospace;
        font-variant-ligatures: none;
        font-weight: 600;
        text-decoration: none;
      }
    `,
  ],
})
export class MarkdownSymbolLink {
  @Input() reference: CanonicalReference = '@hashbrownai/core!Component:type';
}
