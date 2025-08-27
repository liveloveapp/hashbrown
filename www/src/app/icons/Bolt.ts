import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/bolt
 */
@Component({
  selector: 'www-bolt',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#000000"
      stroke-width="1"
      stroke-linecap="round"
      stroke-linejoin="round"
      [style.height]="height()"
      [style.width]="width()"
    >
      <path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11" />
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
export class Bolt {
  height = input<string>('24px');
  width = input<string>('24px');
}
