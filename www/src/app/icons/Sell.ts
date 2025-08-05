import { Component, input } from '@angular/core';

/**
 * Source: https://tablericons.com/icon/sell
 */
@Component({
  selector: 'www-sell',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      [style.width]="width()"
      [style.height]="height()"
      viewBox="0 0 24 24"
      fill="none"
      [attr.stroke]="stroke()"
      stroke-width="1"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        d="M7.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"
        [attr.fill]="fill()"
      />
      <path
        d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z"
        [attr.fill]="fill()"
      />
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
export class Sell {
  stroke = input<string>('#000');
  height = input<string>('24px');
  width = input<string>('24px');
  fill = input<string>('#fff');
}
