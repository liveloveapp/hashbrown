import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/check
 */
@Component({
  selector: 'www-check',
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
      <path d="M5 12l5 5l10 -10" />
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
export class Check {
  height = input<string>('24px');
  width = input<string>('24px');
}
