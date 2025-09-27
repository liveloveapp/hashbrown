import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/menu
 */
@Component({
  selector: 'www-menu',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#000000"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      [style.height]="height()"
      [style.width]="width()"
    >
      <path d="M4 8l16 0" />
      <path d="M4 16l16 0" />
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
export class Menu {
  height = input<string>('24px');
  width = input<string>('24px');
}
