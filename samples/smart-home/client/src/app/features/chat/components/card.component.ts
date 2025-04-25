import { Component, input } from '@angular/core';

@Component({
  selector: 'app-card',
  template: `
    <div class="header">
      {{ title() }}
    </div>
    <div class="body">
      <ng-content></ng-content>
    </div>
  `,
  standalone: true,
})
export class CardComponent {
  title = input.required<string>();
}
