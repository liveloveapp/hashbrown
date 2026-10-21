import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/**
 * The `{ }` icon of the developer tools toggle, for the rail, the phone
 * header and the transcript's inspect buttons.
 */
@Component({
  selector: 'atc-dev-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path
        d="M7 3.5C5.3 3.5 5 4.4 5 5.8v2.1c0 1.1-.5 1.8-1.8 2.1 1.3.3 1.8 1 1.8 2.1v2.1c0 1.4.3 2.3 2 2.3M13 3.5c1.7 0 2 .9 2 2.3v2.1c0 1.1.5 1.8 1.8 2.1-1.3.3-1.8 1-1.8 2.1v2.1c0 1.4-.3 2.3-2 2.3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
})
export class DevIcon {}

/**
 * The thin column at the far left of the workbench. Its one button turns dev
 * mode on and off (`aria-pressed`). Phones hide the rail and use the header
 * button instead.
 */
@Component({
  selector: 'atc-rail',
  imports: [DevIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'atc-rail', role: 'navigation', 'aria-label': 'Tools' },
  template: `
    <button
      type="button"
      class="atc-rail-button"
      aria-label="Developer tools"
      data-testid="dev-toggle"
      [attr.aria-pressed]="on()"
      (click)="toggleDevMode.emit()"
    >
      <atc-dev-icon />
    </button>
  `,
})
export class Rail {
  /** Whether dev mode is on. */
  readonly on = input(false);
  /** Emits when the button is pressed. */
  readonly toggleDevMode = output();
}
