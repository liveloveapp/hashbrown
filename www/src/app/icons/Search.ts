import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/search
 */
@Component({
  selector: 'www-search',
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
      <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"></path>
      <path d="M21 21l-6 -6"></path>
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
export class Search {
  height = input<string>('24px');
  width = input<string>('24px');
}
