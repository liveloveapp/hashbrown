import { Component } from '@angular/core';

@Component({
  selector: 'app-home-writer',
  styles: `
    :host {
      --color: #a4a3a1;

      &:hover {
        --color: #080808;
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
      <g clip-path="url(#clip0_1817_425)">
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M40.0712 32.6217L45.2822 10.8361H42.0617H38.0353H34.8601L40.0712 32.6217Z"
          style="fill: var(--color)"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M22.0826 10.8361H18.8621L26.109 41.133H29.3296H33.356H36.5765L29.3296 10.8361H26.109H22.0826Z"
          style="fill: var(--color)"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M13.3315 10.8364H6.08458L2.86414 10.837L10.1111 41.1338H17.3581L20.5785 41.1332L13.3315 10.8364Z"
          style="fill: var(--color)"
        />
      </g>
      <defs>
        <clipPath id="clip0_1817_425">
          <rect width="48" height="48" fill="white" />
        </clipPath>
      </defs>
    </svg>
  `,
})
export class Writer {}
