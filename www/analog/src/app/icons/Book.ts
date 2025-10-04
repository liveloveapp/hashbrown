import { Component, input } from '@angular/core';

@Component({
  selector: 'www-book',
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      [style.height]="height()"
      [style.width]="width()"
    >
      <mask
        id="mask0_2094_124"
        style="mask-type:alpha"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="24"
        height="24"
      >
        <rect width="24" height="24" fill="#D9D9D9" />
      </mask>
      <g mask="url(#mask0_2094_124)">
        <path
          d="M6.75 22C6 22 5.35417 21.7459 4.8125 21.2375C4.27083 20.7292 4 20.1 4 19.35V5.40005C4 4.76672 4.19583 4.20005 4.5875 3.70005C4.97917 3.20005 5.49167 2.88338 6.125 2.75005L16 0.800049V16.8L6.525 18.7C6.375 18.7334 6.25 18.8125 6.15 18.9375C6.05 19.0625 6 19.2 6 19.35C6 19.5334 6.075 19.6875 6.225 19.8125C6.375 19.9375 6.55 20 6.75 20H18V4.00005H20V22H6.75ZM9 16.175L14 15.2V3.25005L9 4.22505V16.175ZM7 16.575V4.62505L6.625 4.70005C6.44167 4.73338 6.29167 4.81255 6.175 4.93755C6.05833 5.06255 6 5.21672 6 5.40005V16.825C6.08333 16.7917 6.17083 16.7625 6.2625 16.7375C6.35417 16.7125 6.44167 16.6917 6.525 16.675L7 16.575Z"
          fill="#1C1B1F"
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
export class Book {
  height = input<string>('24px');
  width = input<string>('24px');
}
