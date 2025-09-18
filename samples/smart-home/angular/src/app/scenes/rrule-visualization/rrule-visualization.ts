import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  buildScheduleDetailSections,
  formatScheduleEnd,
  formatScheduleExdates,
  formatScheduleFrequencyLabel,
  formatScheduleStart,
  formatScheduleSummary,
  RRuleDetailSection,
} from './rrule-utils';
import { ParsedSchedule } from './rrule-types';
import { RruleDetailSection } from './rrule-detail-section';

@Component({
  selector: 'app-rrule-visualization',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RruleDetailSection],
  template: `
    <div class="container">
      <div class="summary">
        <span class="frequency">{{ frequencyLabel() }}</span>
        <p>{{ summary() }}</p>
        @if (metaEntries().length) {
          <dl class="meta">
            @for (entry of metaEntries(); track entry.label) {
              <div class="meta-entry">
                <dt>{{ entry.label }}</dt>
                <dd>{{ entry.value }}</dd>
              </div>
            }
          </dl>
        }
      </div>

      @if (detailSections().length) {
        <div class="details">
          @for (section of detailSections(); track section.title) {
            <app-rrule-detail-section
              [title]="section.title"
              [items]="section.items"
            />
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .container {
      display: grid;
      gap: 16px;
      background-color: #d8ecef;
      border-radius: 20px;
      padding: 20px;
      border: 1px solid rgba(255, 255, 255, 0.32);
    }

    .summary {
      display: grid;
      gap: 12px;
    }

    .summary p {
      font: var(--mat-sys-body-large);
      color: var(--mat-sys-on-surface);
      line-height: 1.5;
    }

    .frequency {
      justify-self: start;
      font: var(--mat-sys-label-large);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      background: rgba(255, 255, 255, 0.32);
      color: var(--mat-sys-on-secondary-container);
      border-radius: 999px;
      padding: 6px 12px;
    }

    .meta {
      display: grid;
      gap: 8px;
      margin: 0;
    }

    .meta-entry {
      display: grid;
      gap: 2px;
      background: rgba(255, 255, 255, 0.32);
      border-radius: 12px;
      padding: 10px 12px;
    }

    dt {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    dd {
      margin: 0;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface);
    }

    .details {
      display: grid;
      gap: 16px;
    }

    @media (min-width: 480px) {
      .details {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
    }
  `,
})
export class RruleVisualization {
  readonly schedule = input.required<ParsedSchedule>();

  readonly summary = computed(() => formatScheduleSummary(this.schedule()));
  readonly frequencyLabel = computed(() =>
    formatScheduleFrequencyLabel(this.schedule()),
  );
  readonly start = computed(() => formatScheduleStart(this.schedule()));
  readonly end = computed(() => formatScheduleEnd(this.schedule()));
  readonly exdates = computed(() => formatScheduleExdates(this.schedule()));
  readonly detailSections = computed<RRuleDetailSection[]>(() =>
    buildScheduleDetailSections(this.schedule()),
  );
  readonly metaEntries = computed(() => {
    const entries: { label: string; value: string }[] = [];
    const start = this.start();
    const end = this.end();
    const schedule = this.schedule();
    const rrule = schedule.rrule;

    if (start) {
      entries.push({ label: 'Starts', value: start });
    }

    if (end) {
      const label = rrule?.count ? 'Ends After' : 'Runs Until';
      entries.push({ label, value: end });
    } else if (rrule?.count) {
      const occurrences =
        rrule.count === 1 ? '1 occurrence' : `${rrule.count} occurrences`;
      entries.push({ label: 'Ends After', value: occurrences });
    }

    const exclusions = this.exdates();
    if (exclusions.length) {
      entries.push({
        label: exclusions.length === 1 ? 'Exclusion' : 'Exclusions',
        value: exclusions.join(', '),
      });
    }

    return entries;
  });
}
