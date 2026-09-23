import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../../services/AnalyticsService';
import { ConfigService } from '../../services/ConfigService';
import { GITHUB_URL, quickStartUrl } from './home.content';
import { InstallCommand } from './InstallCommand';

@Component({
  selector: 'www-closing-cta',
  imports: [InstallCommand, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card">
      <img src="/image/logo/brand-mark.svg" alt="" width="56" height="56" />
      <h2>Get started</h2>
      <www-install-command [centered]="true" />
      <div class="actions">
        <a
          class="hb-btn primary"
          [routerLink]="quickStart()"
          (click)="analytics.track('quick-start-clicked')"
          >Quick start →</a
        >
        <a class="hb-btn" [href]="github" target="_blank" rel="noopener"
          >Star on GitHub</a
        >
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 0 72px;
    }

    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 56px 24px;
      border-radius: 28px;
      background: var(--sunshine-yellow-light);
      text-align: center;
    }

    h2 {
      font: 800 36px/1.1 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
    }

    @media screen and (min-width: 1024px) {
      h2 {
        font-size: 44px;
      }
    }
  `,
})
export class ClosingCta {
  private readonly config = inject(ConfigService);
  readonly analytics = inject(AnalyticsService);
  readonly github = GITHUB_URL;
  readonly quickStart = computed(() => quickStartUrl(this.config.sdk()));
}
