import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-light-list',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="list-header">
      <div class="list-icon">
        <mat-icon>bed</mat-icon>
      </div>
      <h2 class="list-title">
        {{ title() }}
      </h2>
    </div>
    <div class="list-content">
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 8px;
        background-color: #fff;
        border-radius: 8px;
        border: 1px solid var(--mat-sys-outline);
        margin-bottom: 8px;
      }

      .list-header {
        display: grid;
        grid-template-columns: 32px 1fr;
        align-items: center;
        column-gap: 24px;
        padding: 16px 16px 8px;
      }

      .list-icon {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .list-content {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      :host ::ng-deep app-light:not(:last-child) {
        border-bottom: 1px solid var(--mat-sys-outline);
      }
    `,
  ],
})
export class LightList {
  title = input.required<string>();
}
