import { Component } from '@angular/core';

@Component({
  selector: 'app-wendys-order-icon',
  standalone: true,
  template: `<span
    class="icon"
    role="img"
    [attr.aria-label]="label"
    [attr.title]="label"
    >W</span
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
        background-color: #0071ce;
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
export class WendysOrderIcon {
  readonly label = "Wendy's Ordering";
}
