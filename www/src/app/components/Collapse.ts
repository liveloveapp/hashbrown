import { Component, input, output } from '@angular/core';
import { ChevronRight } from '../icons/ChevronRight';

@Component({
  selector: 'www-collapse',
  imports: [ChevronRight],
  template: ` <div>
    <button (click)="toggle.emit()">
      {{ title() }}
      <www-chevron-right [class.open]="open()" />
    </button>
    @if (open()) {
      <ng-content />
    }
  </div>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      button {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        font: 500 12px/16px sans-serif;
        text-transform: uppercase;

        > www-chevron-right {
          transform: rotate(0deg);
          transition: transform 0.2s ease-in-out;

          &.open {
            transform: rotate(90deg);
          }
        }
      }

      li {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
    `,
  ],
})
export class Collapse {
  title = input.required<string>();
  open = input.required<boolean>();
  toggle = output<void>();
}
