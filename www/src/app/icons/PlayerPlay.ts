import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/player-play
 */
@Component({
  selector: 'www-player-play',
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
      <path d="M7 4v16l13 -8z" />
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
export class PlayerPlay {
  height = input<string>('24px');
  width = input<string>('24px');
}
