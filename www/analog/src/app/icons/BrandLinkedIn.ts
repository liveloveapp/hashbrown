import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/brand-linkedin
 */
@Component({
  selector: 'www-brand-linkedin',
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
      <path
        d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"
      ></path>
      <path d="M8 11l0 5"></path>
      <path d="M8 8l0 .01"></path>
      <path d="M12 16l0 -5"></path>
      <path d="M16 16v-3a2 2 0 0 0 -4 0"></path>
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
export class BrandLinkedIn {
  height = input<string>('24px');
  width = input<string>('24px');
}
