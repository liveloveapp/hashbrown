import { Component, input } from '@angular/core';

@Component({
  selector: 'www-star-shine',
  template: `
    <svg
      [style.width]="width()"
      [style.height]="height()"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask
        id="mask0_2315_128"
        style="mask-type:alpha"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="100%"
        height="100%"
      >
        <rect width="100%" height="100%" fill="currentColor" />
      </mask>
      <g mask="url(#mask0_2315_128)">
        <path
          d="M21.3 18.7L18.3 15.7L19.7 14.3L22.7 17.3L21.3 18.7ZM17.7 6.7L16.3 5.3L19.3 2.3L20.7 3.7L17.7 6.7ZM6.30005 6.7L3.30005 3.7L4.70005 2.3L7.70005 5.3L6.30005 6.7ZM2.70005 18.7L1.30005 17.3L4.30005 14.3L5.70005 15.7L2.70005 18.7ZM8.85005 16.825L12 14.925L15.15 16.85L14.325 13.25L17.1 10.85L13.45 10.525L12 7.125L10.55 10.5L6.90005 10.825L9.67505 13.25L8.85005 16.825ZM5.82505 21L7.45005 13.975L2.00005 9.25L9.20005 8.625L12 2L14.8 8.625L22 9.25L16.55 13.975L18.175 21L12 17.275L5.82505 21Z"
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
export class StarShine {
  height = input<string>('24px');
  width = input<string>('24px');
}
