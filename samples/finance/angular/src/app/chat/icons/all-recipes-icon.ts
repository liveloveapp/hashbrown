import { Component } from '@angular/core';

@Component({
  selector: 'app-all-recipes-icon',
  standalone: true,
  template: `<span
    class="icon"
    role="img"
    [attr.aria-label]="label"
    [attr.title]="label"
    >A</span
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
        background-color: #f97316;
        color: #111111;
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
export class AllRecipesIcon {
  readonly label = 'Allrecipes';
}
