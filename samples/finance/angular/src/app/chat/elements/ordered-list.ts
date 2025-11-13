import { Component, computed, input } from '@angular/core';
import { createSegmentedTexts } from './text-fragments';

@Component({
  selector: 'app-ordered-list',
  template: `
    <ol>
      @for (item of itemsWithFragments(); track item.id) {
        <li>
          @for (fragment of item.fragments; track fragment.id) {
            <span>{{ fragment.text }}</span>
          }
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

      span {
        opacity: 1;
        transition: opacity 0.5s ease;

        @starting-style {
          opacity: 0;
        }
      }
    `,
  ],
})
export class OrderedList {
  readonly items = input<string[]>([]);
  readonly itemsWithFragments = computed(() =>
    createSegmentedTexts(this.items()),
  );
}
