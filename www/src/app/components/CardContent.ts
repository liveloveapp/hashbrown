import { Component } from '@angular/core';

@Component({
  selector: 'www-card-content',
  template: ` <ng-content></ng-content> `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
      }
    `,
  ],
})
export class CardContent {}
