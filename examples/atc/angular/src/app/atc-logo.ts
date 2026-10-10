import { ATC_MARK } from '@atc/shared';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The ATC lettermark, drawn in the current text colour. */
@Component({
  selector: 'atc-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg
    role="img"
    aria-label="ATC"
    [attr.viewBox]="mark.viewBox"
    [attr.height]="height()"
    [attr.width]="height() * 3.125"
    fill="none"
    stroke="currentColor"
    [attr.stroke-width]="mark.strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    @for (d of mark.paths; track d) {
      <path [attr.d]="d" />
    }
  </svg>`,
})
export class AtcLogoComponent {
  /** Rendered height in pixels; width follows the mark's aspect ratio. */
  readonly height = input(18);
  protected readonly mark = ATC_MARK;
}
