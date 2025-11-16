import { Component, computed, input } from '@angular/core';
import {
  MagicTextRenderer,
  type MagicTextRendererCitation,
} from '../magic-text-renderer';

@Component({
  selector: 'app-unordered-list',
  imports: [MagicTextRenderer],
  template: `
    <ul>
      @for (item of itemsWithIds(); track item.id) {
        <li>
          <app-magic-text-renderer
            [text]="item.text"
            [citations]="citations()"
          ></app-magic-text-renderer>
        </li>
      }
    </ul>
  `,
  styles: [
    `
      :host {
        display: block;
        margin: 12px 0;
        width: var(--article-width);
      }

      ul {
        margin: 0;
        padding-left: 24px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        list-style-type: disc;
      }

      li {
        line-height: 1.3;
      }
    `,
  ],
})
export class UnorderedList {
  readonly items = input<string[]>([]);
  readonly citations = input<MagicTextRendererCitation[]>([]);
  readonly itemsWithIds = computed(() =>
    this.items().map((text, index) => ({
      id: index,
      text,
    })),
  );
}
