import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CodeHighlight } from '../../pipes/CodeHighlight';
import { AnalyticsService } from '../../services/AnalyticsService';
import { ConfigService } from '../../services/ConfigService';
import { ToastService } from '../../services/ToastService';
import { GitHubStarButton } from '../GitHubStarButton';
import { copyText } from './copy-text';
import { agentPrompt, HERO_CODE, quickStartUrl } from './home.content';
import { InstallCommand } from './InstallCommand';

@Component({
  selector: 'www-home-hero',
  imports: [CodeHighlight, GitHubStarButton, InstallCommand, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="copy">
      <h1>AI chat and agents for your React or Angular app</h1>
      <p class="lead">
        Hashbrown is a headless TypeScript framework. Let the model render your
        own components, run tools in the browser, and stream typed output from
        any model.
      </p>
      <www-install-command />
      <div class="actions">
        <a
          class="btn primary"
          [routerLink]="quickStart()"
          (click)="analytics.track('quick-start-clicked')"
          >Quick start →</a
        >
        <button type="button" class="btn" (click)="copyPrompt()">
          Copy prompt for your coding agent
        </button>
      </div>
      <div class="proof">
        <www-github-star-button />
        <span>MIT licensed</span>
        <span>OpenAI · Anthropic · Gemini · Bedrock · Azure · Ollama</span>
      </div>
    </div>
    <div class="panel">
      <div class="bar">
        <span class="dots" aria-hidden="true">
          <span class="dot"></span><span class="dot"></span
          ><span class="dot"></span>
        </span>
        <span class="file">{{ sample().file }}</span>
      </div>
      <div
        class="code"
        [innerHTML]="sample().code | codeHighlight: sample().lang"
      ></div>
      <div class="result" aria-hidden="true">
        <div class="bubble">Show me Acme's overdue invoice</div>
        <div class="invoice">
          <strong>INV-1042 · Acme Corp</strong>
          <span class="tag">62 days overdue</span>
          <span>$12,480.00 · due Jul 22</span>
        </div>
        <div class="streaming">
          &lt;InvoiceCard&gt; streaming <span class="caret"></span>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 40px;
      align-items: center;
      padding: 48px 0;
    }

    .copy {
      min-width: 0;
    }

    h1 {
      font: 800 40px/1.04 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    .lead {
      margin: 20px 0 28px;
      max-width: 540px;
      font:
        400 19px/1.55 'Fredoka',
        sans-serif;
      color: var(--gray);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      padding: 11px 18px;
      border: 1.5px solid var(--chocolate-brown);
      border-radius: 12px;
      background: #fff;
      color: var(--chocolate-brown);
      font:
        600 15px/1 'Fredoka',
        sans-serif;
      cursor: pointer;
      text-decoration: none;
    }

    .btn.primary {
      background: var(--chocolate-brown);
      color: #fff;
    }

    .proof {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 14px;
      margin-top: 22px;
      font:
        400 14px/1.4 'Fredoka',
        sans-serif;
      color: var(--gray);
    }

    .panel {
      min-width: 0;
      overflow: hidden;
      background: #fff;
      border: 1px solid rgba(232, 162, 61, 0.33);
      border-radius: 18px;
      box-shadow: 0 18px 50px rgba(119, 70, 37, 0.1);
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 14px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      font:
        400 12px/1 'Fredoka',
        sans-serif;
      color: var(--gray);
    }

    .dots {
      display: inline-flex;
      gap: 6px;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #e7e3d6;
    }

    .file {
      margin-left: 8px;
    }

    .code {
      padding: 16px 18px;
      overflow-x: auto;
      font:
        400 12.5px/1.6 'JetBrains Mono',
        monospace;
      color: var(--gray-dark);
    }

    .result {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 16px;
      border-top: 1px dashed rgba(232, 162, 61, 0.55);
      background: var(--vanilla-ivory);
      font:
        400 14px/1.4 'Fredoka',
        sans-serif;
    }

    .bubble {
      align-self: flex-end;
      padding: 8px 12px;
      border-radius: 14px;
      background: var(--sunshine-yellow-light);
    }

    .invoice {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 12px;
      padding: 12px 14px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 12px;
      background: #fff;
    }

    .invoice strong {
      font: 700 15px/1.3 var(--font-heading);
    }

    .tag {
      padding: 1px 8px;
      border-radius: 6px;
      background: var(--sunset-orange-light);
      color: var(--indian-red-dark);
      font-size: 12px;
    }

    .streaming {
      font-size: 12px;
      color: var(--chocolate-brown-light);
    }

    .caret {
      display: inline-block;
      width: 7px;
      height: 14px;
      vertical-align: -2px;
      background: var(--sunset-orange);
      animation: blink 1s steps(2) infinite;
    }

    @keyframes blink {
      50% {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .caret {
        animation: none;
      }
    }

    @media screen and (min-width: 1024px) {
      :host {
        grid-template-columns: minmax(0, 1.02fr) minmax(0, 1fr);
        gap: 56px;
        padding: 64px 0 56px;
      }

      h1 {
        font-size: 58px;
        line-height: 1.02;
      }
    }
  `,
})
export class HomeHero {
  private readonly config = inject(ConfigService);
  private readonly toast = inject(ToastService);
  readonly analytics = inject(AnalyticsService);

  readonly sample = computed(() => HERO_CODE[this.config.sdk()]);
  readonly quickStart = computed(() => quickStartUrl(this.config.sdk()));

  async copyPrompt(): Promise<void> {
    const sdk = this.config.sdk();
    const copied = await copyText(
      agentPrompt(sdk),
      `prompt-copied-${sdk}` as const,
      {
        clipboard: globalThis.navigator?.clipboard,
        track: (event) => this.analytics.track(event),
      },
    );
    if (copied) {
      this.toast.success('Prompt copied. Paste it into your coding agent.', {
        position: 'top-center',
      });
    }
  }
}
