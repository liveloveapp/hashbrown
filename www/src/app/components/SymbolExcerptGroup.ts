import { Component } from '@angular/core';

@Component({
  selector: 'www-symbol-excerpt-group',
  template: `<ng-content />`,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        background-color: rgba(61, 60, 58, 0.04);
        border-radius: 12px;
        min-width: 100%;
        width: auto;
        overflow-x: auto;
      }
    `,
  ],
})
export class SymbolExcerptGroup {}
