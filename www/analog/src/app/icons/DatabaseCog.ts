import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/database-cog
 */
@Component({
  selector: 'www-database-cog',
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
        d="M4 6c0 1.657 3.582 3 8 3s8 -1.343 8 -3s-3.582 -3 -8 -3s-8 1.343 -8 3"
      />
      <path d="M4 6v6c0 1.657 3.582 3 8 3c.21 0 .42 -.003 .626 -.01" />
      <path d="M20 11.5v-5.5" />
      <path d="M4 12v6c0 1.657 3.582 3 8 3" />
      <path d="M19.001 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M19.001 15.5v1.5" />
      <path d="M19.001 21v1.5" />
      <path d="M22.032 17.25l-1.299 .75" />
      <path d="M17.27 20l-1.3 .75" />
      <path d="M15.97 17.25l1.3 .75" />
      <path d="M20.733 20l1.3 .75" />
    </svg>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `,
})
export class DatabaseCog {
  height = input<string>('24px');
  width = input<string>('24px');
}
