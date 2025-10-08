import { Component, input } from '@angular/core';

@Component({
  selector: 'www-player-play',
  template: `
    <svg
      [style.height]="height()"
      [style.width]="width()"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask
        id="mask0_2094_130"
        style="mask-type:alpha"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="24"
        height="24"
      >
        <rect width="24" height="24" fill="currentColor" />
      </mask>
      <g mask="url(#mask0_2094_130)">
        <path
          d="M8 19V5L19 12L8 19ZM10 15.35L15.25 12L10 8.65V15.35Z"
          fill="currentColor"
        />
      </g>
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
