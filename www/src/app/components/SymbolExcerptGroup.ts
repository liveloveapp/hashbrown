import { Component } from '@angular/core';

@Component({
  selector: 'www-symbol-excerpt-group',
  template: `<ng-content />`,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        background: #3d3c3a;
        border-radius: 12px;
        min-width: 100%;
        width: auto;
        overflow-x: auto;
      }
    `,
  ],
})
export class SymbolExcerptGroup {}
