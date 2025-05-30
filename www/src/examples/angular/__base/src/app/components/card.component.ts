import { Component, input } from '@angular/core';

@Component({
  selector: 'app-card',
  template: `
    <div class="title">{{ title() }}</div>
    <div class="content"><ng-content></ng-content></div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        background-color: rgba(61, 60, 58, 0.04);
        border-radius: 12px;
        overflow: hidden;
        box-shadow:
          0 8px 12px -3px rgba(0, 0, 0, 0.08),
          0 4px 6px -4px rgba(0, 0, 0, 0.16);
      }

      .title {
        display: flex;
        justify-content: space-between;
        padding: 8px 16px;
        background-color: rgba(61, 60, 58, 0.08);
        font-size: 12px;
        font-weight: 500;
        color: rgba(61, 60, 58, 0.88);
      }

      .content {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px 16px;
      }
    `,
  ],
})
export class CardComponent {
  title = input.required<string>();
}
