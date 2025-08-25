import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-help-topic-marker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <span>{{ markerLabel() }} </span>
    </div>
  `,
  styles: `
    .container {
      width: 36px;
      height: 36px;
      background-color: var(--mat-sys-on-error-container);
      opacity: 0.8;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
  `,
})
export class HelpTopicMarkerComponent {
  markerLabel = input('');
}
