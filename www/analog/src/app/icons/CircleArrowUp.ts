import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/circle-arrow-up
 */
@Component({
  selector: 'www-circle-arrow-up',
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
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"></path>
      <path d="M12 8l-4 4"></path>
      <path d="M12 8v8"></path>
      <path d="M16 12l-4 -4"></path>
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
export class CircleArrowUp {
  height = input<string>('24px');
  width = input<string>('24px');
}
