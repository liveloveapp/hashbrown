import { Component, input } from '@angular/core';

@Component({
  selector: 'app-list',
  standalone: true,
  template: `
    <div class="list-container">
      <div class="list-name">{{ name() }}</div>
      <div class="list-description">{{ description() }}</div>
      <div class="list-content">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      .list-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        border: 1px solid #ef4444;
        padding: 8px;
      }
      .list-name {
        font-weight: 500;
      }
      .list-description {
        color: rgba(0, 0, 0, 0.6);
      }
      .list-content {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
    `,
  ],
})
export class ListComponent {
  name = input.required<string>();
  description = input.required<string>();
}

@Component({
  selector: 'app-list-item',
  standalone: true,
  template: `
    <div class="list-item">
      <div class="list-item-content">{{ content() }}</div>
    </div>
  `,
  styles: [
    `
      .list-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
        border: 1px solid #3b82f6;
        padding: 8px;
      }
      .list-item-content {
        color: rgba(0, 0, 0, 0.87);
      }
    `,
  ],
})
export class ListItemComponent {
  content = input.required<string>();
}
