import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Anthropic } from './providers/Anthropic';
import { Bedrock } from './providers/Bedrock';
import { Gemini } from './providers/Gemini';
import { Ollama } from './providers/Ollama';
import { OpenAi } from './providers/OpenAi';

@Component({
  selector: 'www-works-with',
  imports: [Anthropic, Bedrock, Gemini, Ollama, OpenAi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="provider"><app-home-openai /> OpenAI</span>
    <span class="provider"><app-home-anthropic /> Anthropic</span>
    <span class="provider"><app-home-gemini /> Gemini</span>
    <span class="provider"><app-home-bedrock /> Bedrock</span>
    <span class="provider">Azure</span>
    <span class="provider"><app-home-ollama /> Ollama</span>
    <span class="provider">Local models</span>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 16px 32px;
      padding: 22px 16px;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      background: rgba(255, 255, 255, 0.55);
      font:
        500 15px/1 'Fredoka',
        sans-serif;
      color: var(--gray);
    }

    .provider {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .provider ::ng-deep svg {
      width: 24px;
      height: 24px;
    }
  `,
})
export class WorksWith {}
