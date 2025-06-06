import { Component, input } from '@angular/core';

/**
 * Source:https://tablericons.com/icon/chevron-right
 */
@Component({
  selector: 'www-chevron-right',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      [style.height]="height()"
      [style.width]="width()"
    >
      <path d="M9 6l6 6l-6 6"></path>
    </svg>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      align-items: center;
    }
  `,
})
export class ChevronRight {
  height = input<string>('24px');
  width = input<string>('24px');
}
