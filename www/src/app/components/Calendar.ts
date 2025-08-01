import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * Mini‑calendar
 *
 * • shows the **current month** (uses the user’s local time‑zone)
 * • draws a light‑gray grid (no outer border, no weekday header)
 * • highlights any dates passed through `highlightDates`
 *
 * Usage:
 * <div style="width:300px;height:300px">
 *   <mini-calendar
 *     [dates]="['2025-08-15', new Date('2025‑08‑21')]">
 *   </mini-calendar>
 * </div>
 */
@Component({
  selector: 'www-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ✨ Inline template
  template: `
    <div class="date">
      <span>{{ month().toLocaleString('default', { month: 'short' }) }}</span>
      <span>{{ month().getFullYear() }}</span>
    </div>
    <div class="calendar">
      @for (cell of calendarCells(); track cell.index) {
        <div
          class="cell"
          [class.other-month]="!cell.isCurrentMonth"
          [class.highlight]="cell.isHighlighted"
        >
          {{ cell.day }}
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100%;
      height: 100%;
    }

    .date {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 4px;
      color: var(--gray-dark, #3d3c3a);

      > span:first-child {
        font:
          400 18px/24px 'KefirVariable',
          sans-serif;
        font-variation-settings: 'wght' 400;
      }

      > span:last-child {
        font:
          200 12px/16px 'KefirVariable',
          sans-serif;
        font-variation-settings: 'wght' 200;
      }
    }

    .calendar {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      grid-auto-rows: 1fr;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }

    .cell {
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      aspect-ratio: 1/1;
      font:
        400 normal 12px/12px Fredoka,
        sans-serif;
      border-inline-end: 1px solid var(--gray-light, #a4a3a1);
      border-block-end: 1px solid var(--gray-light, #a4a3a1);
    }

    .cell:nth-child(7n) {
      border-inline-end: none;
    }

    .cell:nth-last-child(-n + 7) {
      border-block-end: none;
    }

    .other-month {
      opacity: 0.4;
    }

    .highlight {
      background: var(--sunshine-yellow, #fbbb52);
      color: var(--gray-dark, #3d3c3a);
    }
  `,
})
export class Calendar {
  readonly month = input<Date>(new Date());
  readonly dates = input<(Date | string)[]>([]);

  private readonly datesSet = computed(() => {
    const raw = this.dates() ?? [];
    return new Set(
      raw.map((d) => {
        const date = typeof d === 'string' ? new Date(d) : d;
        return date.toISOString().slice(0, 10);
      }),
    );
  });

  /**
   * Produces the grid cells for the current month
   * (back‑fills the first week and forward‑fills the last week so the
   * grid is always full – 35 or 42 cells).
   */
  readonly calendarCells = computed(() => {
    const monthDate = this.month();
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const startDayOfWeek = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlankDays = startDayOfWeek;
    const totalCells = Math.ceil((leadingBlankDays + daysInMonth) / 7) * 7;

    const cells: Array<{
      index: number;
      day: number;
      isCurrentMonth: boolean;
      isHighlighted: boolean;
    }> = [];
    for (let i = 0; i < totalCells; i++) {
      const date = new Date(year, month, i - leadingBlankDays + 1);
      const iso = date.toISOString().slice(0, 10);
      cells.push({
        index: i,
        day: date.getDate(),
        isCurrentMonth: date.getMonth() === month,
        isHighlighted: this.datesSet().has(iso),
      });
    }
    return cells;
  });
}
