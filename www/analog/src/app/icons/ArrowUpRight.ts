import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/arrow-up-right
 */
@Component({
  selector: 'www-arrow-up-right',
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
      <path d="M17 7l-10 10"></path>
      <path d="M8 7l9 0l0 9"></path>
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
export class ArrowUpRight {
  height = input<string>('24px');
  width = input<string>('24px');
}
