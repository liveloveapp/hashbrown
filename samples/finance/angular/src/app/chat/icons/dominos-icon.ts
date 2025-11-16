import { Component } from '@angular/core';

@Component({
  selector: 'app-dominos-icon',
  standalone: true,
  template: `<span
    class="icon"
    role="img"
    [attr.aria-label]="label"
    [attr.title]="label"
    >D</span
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
        background-color: #006491;
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
export class DominosIcon {
  readonly label = "Domino's";
}
