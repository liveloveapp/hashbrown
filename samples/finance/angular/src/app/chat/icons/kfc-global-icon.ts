import { Component } from '@angular/core';

@Component({
  selector: 'app-kfc-global-icon',
  standalone: true,
  template: `<span
    class="icon"
    role="img"
    [attr.aria-label]="label"
    [attr.title]="label"
    >K</span
  >`,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .icon {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background-color: #e4002b;
        color: #ffffff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        font-weight: 600;
        line-height: 1;
        text-transform: uppercase;
      }
    `,
  ],
})
export class KfcGlobalIcon {
  readonly label = 'KFC Global';
}
