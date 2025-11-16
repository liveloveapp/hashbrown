import { Component, computed, input } from '@angular/core';
import {
  MagicTextRenderer,
  type MagicTextRendererCitation,
} from '../magic-text-renderer';

@Component({
  selector: 'app-ordered-list',
  imports: [MagicTextRenderer],
  template: `
    <ol>
      @for (item of itemsWithIds(); track item.id) {
        <li>
          <app-magic-text-renderer
            [text]="item.text"
            [citations]="citations()"
          ></app-magic-text-renderer>
        </li>
      }
    </ol>
  `,
  styles: [
    `
      :host {
        display: block;
        margin: 12px 0;
        width: var(--article-width);
      }

      ol {
        margin: 0;
        padding-left: 24px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        list-style-type: decimal;
      }

      li {
        line-height: 1.3;
      }
    `,
  ],
})
export class OrderedList {
  readonly items = input<string[]>([]);
  readonly citations = input<MagicTextRendererCitation[]>([]);
  readonly itemsWithIds = computed(() =>
    this.items().map((text, index) => ({
      id: index,
      text,
    })),
  );
}
