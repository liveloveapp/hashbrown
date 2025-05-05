import { Component } from '@angular/core';

@Component({
  selector: 'www-card',
  template: `
    <ng-content select="www-card-header"></ng-content>
    <ng-content select="www-card-content"></ng-content>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
        background-color: rgba(47, 47, 43, 0.04);
        border-radius: 12px;
        overflow: hidden;
        box-shadow:
          0 8px 12px -3px rgba(0, 0, 0, 0.08),
          0 4px 6px -4px rgba(0, 0, 0, 0.16);
      }
    `,
  ],
})
export class Card {}
