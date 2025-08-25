import { Component } from '@angular/core';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-symbol-excerpt-group',
  imports: [Squircle],
  template: `<div
    class="group"
    wwwSquircle="16"
    [wwwSquircleBorderWidth]="4"
    wwwSquircleBorderColor="var(--gray-light, #a4a3a1)"
  >
    <ng-content />
  </div>`,
  styles: [
    `
      :host {
        display: block;
      }

      .group {
        display: flex;
        flex-direction: column;
        background: #3d3c3a;
        min-width: 100%;
        width: auto;
        overflow-x: auto;
        padding: 16px;
      }
    `,
  ],
})
export class SymbolExcerptGroup {}
