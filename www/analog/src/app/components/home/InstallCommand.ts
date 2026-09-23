import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { AnalyticsService } from '../../services/AnalyticsService';
import { ConfigService } from '../../services/ConfigService';
import { ToastService } from '../../services/ToastService';
import { copyText } from './copy-text';
import { installCommand, Sdk, SDK_LABELS } from './home.content';

@Component({
  selector: 'www-install-command',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.centered]': 'centered()' },
  template: `
    <div class="tabs" role="radiogroup" aria-label="Framework">
      @for (option of sdks; track option) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="sdk() === option"
          [class.on]="sdk() === option"
          (click)="select(option)"
        >
          {{ labels[option] }}
        </button>
      }
    </div>
    <div class="command">
      <code>{{ command() }}</code>
      <button
        type="button"
        class="copy"
        (click)="copy()"
        aria-label="Copy install command"
      >
        Copy
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      width: 100%;
    }

    :host(.centered) {
      align-items: center;
    }

    .tabs {
      display: inline-flex;
      padding: 4px;
      background: #fff;
      border: 1px solid rgba(232, 162, 61, 0.4);
      border-radius: 12px;
    }

    .tabs button {
      font:
        600 14px/1 'Fredoka',
        sans-serif;
      padding: 8px 16px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--gray);
      cursor: pointer;
    }

    .tabs button.on {
      background: var(--sunshine-yellow);
      color: var(--gray-dark);
    }

    .command {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      max-width: 520px;
      padding: 14px 16px;
      background: #fff;
      border: 2px solid var(--sunshine-yellow);
      border-radius: 14px;
      color: var(--chocolate-brown);
    }

    .command code {
      font:
        500 15px/1.4 'JetBrains Mono',
        monospace;
      overflow-x: auto;
      white-space: nowrap;
    }

    .copy {
      flex-shrink: 0;
      font:
        600 13px/1 'Fredoka',
        sans-serif;
      padding: 8px 10px;
      border: 0;
      border-radius: 8px;
      background: var(--sunshine-yellow-light);
      color: var(--chocolate-brown);
      cursor: pointer;
    }
  `,
})
export class InstallCommand {
  private readonly config = inject(ConfigService);
  private readonly analytics = inject(AnalyticsService);
  private readonly toast = inject(ToastService);

  /** Center the tabs and command, used by the closing CTA. */
  readonly centered = input(false);

  readonly sdks: Sdk[] = ['react', 'angular'];
  readonly labels = SDK_LABELS;
  readonly sdk = this.config.sdk;
  readonly command = computed(() => installCommand(this.sdk()));

  select(sdk: Sdk): void {
    this.config.set({ sdk });
  }

  async copy(): Promise<void> {
    const copied = await copyText(
      this.command(),
      `install-copied-${this.sdk()}` as const,
      {
        clipboard: globalThis.navigator?.clipboard,
        track: (event) => this.analytics.track(event),
      },
    );
    if (copied) {
      this.toast.success('Install command copied', { position: 'top-center' });
    }
  }
}
