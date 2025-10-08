import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/brand-youtube
 */
@Component({
  selector: 'www-brand-youtube',
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
      <path
        d="M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v-8z"
      />
      <path d="M10 9l5 3l-5 3z" />
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
export class BrandYoutube {
  height = input<string>('24px');
  width = input<string>('24px');
}
