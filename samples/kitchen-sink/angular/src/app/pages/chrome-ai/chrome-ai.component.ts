import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Chat, experimental_local } from '@hashbrownai/core';
import { chatResource } from '@hashbrownai/angular';

@Component({
  selector: 'app-chrome-ai-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="chrome-ai">
      <h1>Chrome Prompt API Demo</h1>
      <p>
        This page attempts to run Hashbrown against Chrome's on-device Gemini
        Nano model. When the Prompt API is unavailable, the request reports an
        error.
      </p>

      <div class="status-panel">
        <p><strong>Resource status:</strong> {{ chromeChat.status() }}</p>
        <p><strong>Availability:</strong> {{ availabilityStatus() }}</p>
        @if (downloadProgress(); as pct) {
          <p><strong>Download progress:</strong> {{ pct }}%</p>
        }
        @if (chromeChat.error(); as err) {
          <p class="error"><strong>Error:</strong> {{ err.message }}</p>
        }
      </div>

      <label class="sr-only" for="prompt-input">Prompt</label>
      <textarea
        id="prompt-input"
        rows="4"
        [(ngModel)]="prompt"
        placeholder="Ask the on-device model anything..."
      ></textarea>

      <div class="actions">
        <button type="button" (click)="send()" [disabled]="isBusy()">
          Send
        </button>
        <button
          type="button"
          (click)="stop()"
          [disabled]="!chromeChat.isReceiving()"
        >
          Stop
        </button>
      </div>

      <section class="messages">
        <h2>Conversation</h2>
        @for (message of chromeChat.value(); track message; let idx = $index) {
          <div class="message" [attr.data-role]="message.role">
            <header>
              {{ message.role | titlecase }}
            </header>
            <pre>{{ formatContent(message) }}</pre>
          </div>
        }
        @if (chromeChat.value().length === 0) {
          <p class="hint">
            Send a message above to see the streaming response.
          </p>
        }
      </section>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .chrome-ai {
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      textarea {
        width: 100%;
        border-radius: 8px;
        border: 1px solid #ddd;
        padding: 12px;
        font-size: 16px;
        font-family: inherit;
        background: #fff;
      }

      .actions {
        display: flex;
        gap: 12px;
      }

      button {
        border: none;
        border-radius: 4px;
        padding: 10px 16px;
        font-weight: 600;
        cursor: pointer;
      }

      button[disabled] {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .status-panel {
        border: 1px solid #eee;
        border-radius: 8px;
        padding: 12px;
        background: #fafafa;
      }

      .messages {
        border-top: 1px solid #eee;
        padding-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .message {
        border: 1px solid #eee;
        border-radius: 8px;
        padding: 12px;
        background: #fff;
      }

      .message[data-role='user'] {
        border-color: #c0e1ff;
      }

      .message[data-role='assistant'] {
        border-color: #ffd699;
      }

      .message header {
        font-size: 12px;
        color: #666;
        margin-bottom: 4px;
      }

      .message pre {
        margin: 0;
        white-space: pre-wrap;
        font-family: inherit;
      }

      .hint {
        color: #666;
        font-style: italic;
      }

      .error {
        color: #b00020;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }
    `,
  ],
})
export class ChromeAiComponent {
  availabilityStatus = signal('Waiting for the first request...');
  downloadProgress = signal<number | null>(null);

  prompt = 'Draft a two-sentence bedtime story about stars.';

  private readonly localTransport = experimental_local({
    events: {
      downloadRequired: (
        status: 'available' | 'unavailable' | 'downloadable' | 'downloading',
      ) => {
        const message =
          status === 'downloadable'
            ? 'Chrome can download Gemini Nano locally. Accept the prompt to continue.'
            : 'Chrome is downloading the Gemini Nano model...';
        this.availabilityStatus.set(message);
      },
      downloadProgress: (percent: number) => {
        this.downloadProgress.set(percent);
      },
    },
  });

  chromeChat = chatResource({
    system: `You are an eloquent on-device assistant. Mention when you are responding locally.`,
    transport: this.localTransport,
    debounce: 50,
  });

  constructor() {
    effect(() => {
      if (this.chromeChat.status() === 'error') {
        this.availabilityStatus.set('The local Prompt API request failed.');
      }
    });
  }

  send() {
    const content = this.prompt?.trim();

    if (!content) {
      return;
    }

    this.availabilityStatus.set('Sending request...');
    this.chromeChat.sendMessage({ role: 'user', content });
  }

  stop() {
    try {
      this.chromeChat.stop(true);
    } catch {
      // Ignored when nothing is streaming.
    }
  }

  isBusy() {
    return this.chromeChat.isSending() || this.chromeChat.isReceiving();
  }

  formatContent(message: Chat.Message<string | object, Chat.AnyTool>) {
    if (typeof message.content === 'string') {
      return message.content;
    }

    if (!message.content) {
      return '';
    }

    try {
      return JSON.stringify(message.content, null, 2);
    } catch {
      return String(message.content);
    }
  }
}
