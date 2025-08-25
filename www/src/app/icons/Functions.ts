import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/functions
 */
@Component({
  selector: 'www-functions',
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
      <path
        d="M4 4m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h10.666a2.667 2.667 0 0 1 2.667 2.667v10.666a2.667 2.667 0 0 1 -2.667 2.667h-10.666a2.667 2.667 0 0 1 -2.667 -2.667z"
      />
      <path
        d="M9 15.5v.25c0 .69 .56 1.25 1.25 1.25c.71 0 1.304 -.538 1.374 -1.244l.752 -7.512a1.381 1.381 0 0 1 1.374 -1.244c.69 0 1.25 .56 1.25 1.25v.25"
      />
      <path d="M9 12h6" />
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
export class Functions {
  height = input<string>('24px');
  width = input<string>('24px');
}
