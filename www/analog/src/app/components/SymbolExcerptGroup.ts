import { Component } from '@angular/core';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-symbol-excerpt-group',
  imports: [Squircle],
  template: `<div
    class="group"
    wwwSquircle="16"
    [wwwSquircleBorderWidth]="8"
    wwwSquircleBorderColor="var(--gray-light, #a4a3a1)"
  >
    <div class="content">
      <ng-content />
    </div>
  </div>`,
  styles: [
    `
      :host {
        display: block;
      }

      .group {
        display: flex;
        flex-direction: column;
        gap: 4px;
        background: #3d3c3a;
        min-width: 100%;
        width: auto;

        > .content {
          overflow-x: auto;
          padding: 24px;
        }
      }
    `,
  ],
})
export class SymbolExcerptGroup {}
