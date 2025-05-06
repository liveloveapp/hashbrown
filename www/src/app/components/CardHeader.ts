import { Component } from '@angular/core';

@Component({
  selector: 'www-card-header',
  template: ` <ng-content></ng-content> `,
  styles: [
    `
      :host {
        display: flex;
        justify-content: space-between;
        padding: 8px 16px;
        background-color: rgba(61, 60, 58, 0.08);
        font-size: 12px;
        font-weight: 500;
        color: rgba(61, 60, 58, 0.88);
      }
    `,
  ],
})
export class CardHeader {}
