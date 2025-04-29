import { Component } from '@angular/core';

@Component({
  selector: 'www-symbol-excerpt-group',
  template: `<ng-content />`,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        background-color: rgba(255, 255, 255, 0.12);
        min-width: 100%;
        width: auto;
        overflow-x: auto;
      }
    `,
  ],
})
export class SymbolExcerptGroup {}
