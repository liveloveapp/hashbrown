import { Component } from '@angular/core';

@Component({
  selector: 'www-symbol-excerpt-group',
  template: `<ng-content />`,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        background-color: rgba(47, 47, 43, 0.08);
        min-width: 100%;
        width: auto;
        overflow-x: auto;
      }
    `,
  ],
})
export class SymbolExcerptGroup {}
