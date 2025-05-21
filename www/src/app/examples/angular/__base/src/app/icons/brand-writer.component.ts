import { Component, input } from '@angular/core';

@Component({
  selector: 'app-brand-writer',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="13.7417 20.4625 32.6293 23.1020"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      [style.height]="height()"
      [style.width]="width()"
    >
      <g id="footer-logo-1">
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M42.3625 37.074L46.371 20.4625H43.8937H40.7964H38.354L42.3625 37.074Z"
          fill="white"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M28.5252 20.4625H26.0479L31.6224 43.5639H34.0998H37.197H39.6744L34.0998 20.4625H31.6224H28.5252Z"
          fill="white"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M21.7936 20.4628H16.219L13.7417 20.4632L19.3163 43.5645H24.8909L27.3681 43.5641L21.7936 20.4628Z"
          fill="white"
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
export class BrandWriterComponent {
  height = input<string>('24px');
  width = input<string>('24px');
}
