import { Component, input } from '@angular/core';
import { exposeComponent, MagicText } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

@Component({
  selector: 'app-unordered-list',
  imports: [MagicText],
  template: `
    <div class="wrapper">
      <ul class="list">
        @for (item of items(); track $index) {
          <li class="item">
            <hb-magic-text [text]="item" />
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    .wrapper {
      display: block;
      width: var(--article-width, 100%);
      margin: 12px 0;
    }

    .list {
      margin: 0;
      padding-left: 24px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      list-style-type: disc;
    }

    .item {
      line-height: 1.3;
    }
  `,
})
export class UnorderedListComponent {
  readonly items = input.required<string[]>();
}

export const exposedUnorderedList = exposeComponent(UnorderedListComponent, {
  name: 'ul',
  description: 'Display a bulleted list of text items',
  input: {
    items: s.streaming.array(
      'The unordered list entries',
      s.streaming.string('The content of a single list entry'),
    ),
  },
});
