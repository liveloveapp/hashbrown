import { Component, input, signal } from '@angular/core';
import { ChevronDown } from '../icons/ChevronDown';

@Component({
  selector: 'www-expander',
  imports: [ChevronDown],
  host: {
    '[class.open]': 'open()',
  },
  template: `
    <button (click)="open.set(!open())" class="title">
      <www-chevron-down />
      <span>{{ title() }}</span>
    </button>
    <div class="content">
      <ng-content></ng-content>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin: 16px 0;

      &.open {
        > .title {
          > www-chevron-down {
            transform: rotate(0);
          }
        }

        > .content {
          display: block;
        }
      }

      > .content {
        display: flex;
        flex-direction: column;
        gap: 8px;
        display: none;
      }
    }

    .title {
      display: flex;
      align-items: center;
      gap: 8px;

      &:hover {
        > span {
          color: var(--gray-light, #a4a3a1);
        }
      }

      > span {
        color: var(--gray, #5e5c5a);
        font:
          500 16px/24px Fredoka,
          sans-serif;
        transition: color 0.2s ease-in-out;
      }

      > www-chevron-down {
        transition: transform 0.2s ease-in-out;
        transform: rotate(-90deg);
      }
    }
  `,
})
export class Expander {
  title = input.required<string>();
  open = signal(false);
}
