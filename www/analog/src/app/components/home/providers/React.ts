import { Component } from '@angular/core';

@Component({
  selector: 'app-home-react',
  styles: `
    :host {
      --color: #a4a3a1;

      &:hover {
        --color: #1a82a7;
      }
    }

    path {
      transition: all 0.2s ease-in-out;
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
      <g clip-path="url(#clip0_1817_399)">
        <path
          d="M24 28.2075C26.3628 28.2075 28.2783 26.3237 28.2783 24C28.2783 21.6762 26.3628 19.7925 24 19.7925C21.6372 19.7925 19.7217 21.6762 19.7217 24C19.7217 26.3237 21.6372 28.2075 24 28.2075Z"
          style="fill: var(--color)"
        />
        <path
          d="M24 32.6202C36.6785 32.6202 46.9565 28.7608 46.9565 24C46.9565 19.2392 36.6785 15.3798 24 15.3798C11.3214 15.3798 1.04346 19.2392 1.04346 24C1.04346 28.7608 11.3214 32.6202 24 32.6202Z"
          style="stroke: var(--color)"
        />
        <path
          d="M16.4091 28.3101C22.7483 39.1085 31.2859 45.9325 35.4782 43.5521C39.6706 41.1717 37.9301 30.4882 31.5909 19.6899C25.2516 8.89158 16.714 2.06752 12.5217 4.44793C8.32937 6.82835 10.0698 17.5118 16.4091 28.3101Z"
          style="stroke: var(--color)"
        />
        <path
          d="M16.4091 19.6899C10.0698 30.4882 8.32939 41.1717 12.5217 43.5521C16.7141 45.9325 25.2516 39.1085 31.5909 28.3101C37.9302 17.5118 39.6706 6.82835 35.4783 4.44794C31.2859 2.06753 22.7484 8.89159 16.4091 19.6899Z"
          style="stroke: var(--color)"
        />
      </g>
      <defs>
        <clipPath id="clip0_1817_399">
          <rect
            width="48"
            height="42"
            fill="white"
            transform="translate(0 3)"
          />
        </clipPath>
      </defs>
    </svg>
  `,
})
export class React {}
