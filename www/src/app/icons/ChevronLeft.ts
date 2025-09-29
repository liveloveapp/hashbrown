import { Component, input } from '@angular/core';

/**
 * Source:https://tablericons.com/icon/chevron-left
 */
@Component({
  selector: 'www-chevron-left',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      [style.height]="height()"
      [style.width]="width()"
    >
      <path d="M15 6l-6 6l6 6" />
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
export class ChevronLeft {
  height = input<string>('24px');
  width = input<string>('24px');
}
