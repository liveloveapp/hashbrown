import { Component } from '@angular/core';

@Component({
  selector: 'app-home-angular',
  styles: `
    :host {
      --color: #a4a3a1;

      &:hover {
        --color: #ef2c95;
      }
    }

    path {
      transition: fill 0.2s ease-in-out;
    }
  `,
  template: `
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clip-path="url(#clip0_1817_389)">
        <path
          d="M28.13 5.48999L40.205 31.475L41.46 11.655L28.13 5.48999Z"
          style="fill: var(--color)"
        />
        <path
          d="M31.245 32.795H16.715L14.86 37.29L23.98 42.49L33.1 37.29L31.245 32.795Z"
          style="fill: var(--color)"
        />
        <path
          d="M19.205 26.965H28.76L23.98 15.35L19.205 26.965Z"
          style="fill: var(--color)"
        />
        <path
          d="M19.83 5.48999L6.5 11.655L7.755 31.475L19.83 5.48999Z"
          style="fill: var(--color)"
        />
      </g>
      <defs>
        <clipPath id="clip0_1817_389">
          <rect width="48" height="48" fill="white" />
        </clipPath>
      </defs>
    </svg>
  `,
})
export class Angular {}
