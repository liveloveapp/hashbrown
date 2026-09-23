import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { CodeHighlight } from '../../pipes/CodeHighlight';
import { ConfigService } from '../../services/ConfigService';
import { STEPS } from './home.content';

@Component({
  selector: 'www-how-it-works',
  imports: [CodeHighlight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <h2>How it works</h2>
      <p>Three pieces. Same API in React and Angular.</p>
    </header>
    <ol>
      @for (step of steps(); track step.title; let i = $index) {
        <li>
          <span class="num">{{ i + 1 }}</span>
          <h3>{{ step.title }}</h3>
          <p>{{ step.body }}</p>
          <div class="code" [innerHTML]="step.code | codeHighlight"></div>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
      padding: 72px 0;
    }

    header {
      max-width: 640px;
      margin-bottom: 32px;
    }

    h2 {
      font: 800 40px/1.08 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    header p {
      margin-top: 12px;
      font:
        400 17px/1.5 'Fredoka',
        sans-serif;
      color: var(--gray);
    }

    ol {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      flex-direction: column;
      padding: 22px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 18px;
      background: #fff;
    }

    .num {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      margin-bottom: 12px;
      border-radius: 50%;
      background: var(--sunshine-yellow);
      font: 800 15px/1 var(--font-heading);
      color: var(--gray-dark);
    }

    h3 {
      margin-bottom: 6px;
      font: 700 20px/1.2 var(--font-heading);
      letter-spacing: -0.02em;
      color: var(--chocolate-brown);
    }

    li p {
      margin-bottom: 14px;
      font:
        400 15px/1.5 'Fredoka',
        sans-serif;
      color: var(--gray);
    }

    .code {
      margin-top: auto;
      padding: 12px 14px;
      overflow-x: auto;
      border-radius: 12px;
      background: var(--vanilla-ivory);
      font:
        400 12px/1.6 'JetBrains Mono',
        monospace;
    }

    @media screen and (min-width: 1024px) {
      ol {
        grid-template-columns: repeat(3, 1fr);
      }
    }
  `,
})
export class HowItWorks {
  private readonly config = inject(ConfigService);
  readonly steps = computed(() => STEPS[this.config.sdk()]);
}
