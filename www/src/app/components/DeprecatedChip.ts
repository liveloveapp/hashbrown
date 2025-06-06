import { Component, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'www-deprecated-chip',
  imports: [MatTooltipModule],
  template: ` <span [matTooltip]="reason()">Deprecated</span> `,
  styles: [
    `
      :host {
        display: flex;
        width: 84px;
        height: 24px;
        justify-content: center;
        align-items: center;
        flex-grow: 0;
        flex-shrink: 0;
        font-family: 'Operator Mono', monospace;
        text-transform: uppercase;
        font-weight: 700;
        font-size: 10px;
        background-color: rgba(255, 0, 0, 0.36);
        padding: 4px 8px;
        border-radius: 4px;
      }
    `,
  ],
})
export class DeprecatedChip {
  reason = input.required<string>();
}
