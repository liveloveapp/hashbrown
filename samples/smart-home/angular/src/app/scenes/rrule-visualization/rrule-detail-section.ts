import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-rrule-detail-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    @if (items().length) {
      <section class="section">
        <h4>{{ title() }}</h4>
        <ul class="pill-list">
          @for (item of items(); track item) {
            <li>{{ item }}</li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .section {
      display: grid;
      gap: 8px;
    }

    h4 {
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .pill-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0;
      margin: 0;
      list-style: none;
    }

    .pill-list li {
      background: #64afb5;
      border-radius: 999px;
      padding: 6px 12px;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface);
      letter-spacing: 0.01em;
    }
  `,
})
export class RruleDetailSection {
  readonly title = input.required<string>();
  readonly items = input.required<readonly string[]>();
}
