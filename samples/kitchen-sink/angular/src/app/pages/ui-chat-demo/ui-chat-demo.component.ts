import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { experimental_chrome, prompt, s } from '@hashbrownai/core';
import { MarkdownComponent as NgxMarkdownComponent } from 'ngx-markdown';

@Component({
  selector: 'app-markdown',
  imports: [NgxMarkdownComponent],
  template: '<markdown [data]="content()"></markdown>',
})
export class MarkdownComponent {
  content = input.required<string>();
}

@Component({
  selector: 'app-card',
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>{{ title() }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <ng-content></ng-content>
      </mat-card-content>
    </mat-card>
  `,
  imports: [MatCardModule],
})
export class CardComponent {
  title = input<string>('');
}

const Card = exposeComponent(CardComponent, {
  description: 'Simple card with a title and body text',
  children: 'any',
  input: {
    title: s.string('Title text'),
  },
});

const Markdown = exposeComponent(MarkdownComponent, {
  description: 'Markdown content',
  input: {
    content: s.streaming.string('The markdown content'),
  },
});

@Component({
  selector: 'app-ui-chat-demo',
  standalone: true,
  imports: [CommonModule, FormsModule, RenderMessageComponent],
  template: `
    <section class="ui-chat-demo">
      <header>
        <h1>UI Chat Demo</h1>
        <p>
          This is the smallest possible example of <code>uiChatResource</code>.
          Ask the assistant for a snippet of UI, and Hashbrown renders the
          streamed component tree on the right.
        </p>
      </header>

      <div class="layout">
        <form (ngSubmit)="send()">
          <label class="sr-only" for="prompt">Prompt</label>
          <textarea
            id="prompt"
            rows="4"
            [(ngModel)]="prompt"
            name="prompt"
            placeholder="Build a simple card with a button"
          ></textarea>

          <div class="actions">
            <button type="submit" [disabled]="uiChat.isLoading()">
              {{ uiChat.isLoading() ? 'Generating…' : 'Generate UI' }}
            </button>
          </div>
        </form>

        <section class="preview">
          <h2>Rendered UI</h2>
          <div class="viewport" aria-live="polite">
            @for (message of uiChat.value(); track message) {
              @if (message.role === 'assistant') {
                <article>
                  <hb-render-message [message]="message"></hb-render-message>
                </article>
              }
            }
            @if (uiChat.value().length === 0) {
              <p class="hint">
                Describe a small UI you want the model to draft.
              </p>
            }
          </div>
        </section>
      </div>
    </section>
  `,
  styles: [
    `
      .ui-chat-demo {
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .layout {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 24px;
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      textarea {
        width: 100%;
        padding: 12px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        font-size: 16px;
        font-family: inherit;
      }

      .actions {
        display: flex;
        gap: 12px;
      }

      button {
        padding: 10px 16px;
        border-radius: 6px;
        border: none;
        font-weight: 600;
        cursor: pointer;
      }

      .ghost {
        background: transparent;
        border: 1px solid #d1d5db;
        color: #1f2937;
      }

      .preview {
        border-left: 1px solid #eee;
        padding-left: 16px;
      }

      .viewport {
        border: 1px dashed #d1d5db;
        border-radius: 8px;
        padding: 16px;
        min-height: 200px;
        background: #f9fafb;
      }

      .hint {
        color: #6b7280;
        font-style: italic;
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
export class UiChatDemoComponent {
  prompt = 'Create a customer testimonial card with a button.';

  uiChat = uiChatResource({
    model: [experimental_chrome(), 'gpt-4o-mini'],
    system: prompt`
      You are a UI designer. You output simple UI snippets using the provided components.
      <user>Create a customer testimonial card with a button.</user>
      <assistant>
        <ui>
          <app-card title="Customer Testimonial">
            <app-markdown content="I love this product! It's so easy to use." />
          </app-card>
        </ui>
      </assistant>
    `,
    components: [Card, Markdown],
  });

  send() {
    const content = this.prompt.trim();
    if (!content) {
      return;
    }

    this.uiChat.sendMessage({ role: 'user', content });
  }
}
