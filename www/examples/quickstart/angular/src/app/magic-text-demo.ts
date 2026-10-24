import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import {
  chatResource,
  MagicText,
  type MagicTextCitationClickEvent,
  type MagicTextCitationRenderData,
} from '@hashbrownai/angular';
import { magicTextState, magicTextSystem } from '../../../runtime/magic-text';

/** Streams a fresh Markdown reply and opens source details without navigation. */
@Component({
  selector: 'app-magic-text-demo',
  imports: [MagicText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Magic Text</h1>
      <p>
        Generate a packing reply, then select its citation to inspect the
        source.
      </p>
      <nav aria-label="Reply actions">
        <button type="button" [disabled]="state().busy" (click)="generate()">
          Generate reply
        </button>
        <button type="button" [disabled]="!state().busy" (click)="cancel()">
          Cancel
        </button>
      </nav>
      <p role="status">{{ state().status }}</p>
      @if (chat.error()) {
        <p role="alert">Check your server, then generate another reply.</p>
      }
      <section aria-label="Generated reply" [attr.aria-busy]="state().busy">
        <hb-magic-text
          [text]="text()"
          [isComplete]="state().isComplete"
          [caret]="state().busy"
          (citationClick)="selectCitation($event)"
        />
      </section>
      <p>
        Source markers without a source URL are unresolved and cannot open
        details yet.
      </p>
      @if (citation(); as source) {
        <aside aria-label="Source details">
          <h2>Source {{ source.number }}</h2>
          <p>
            {{
              source.id === 'docs' ? 'Hashbrown docs' : 'Reference ' + source.id
            }}
          </p>
          <p>{{ source.url ?? 'Source URL unavailable.' }}</p>
          <p>
            This citation is a model-provided reference. It does not verify the
            reply.
          </p>
          <button type="button" (click)="citation.set(null)">
            Close source details
          </button>
        </aside>
      }
      <p>
        When the stream ends, isComplete finalizes Markdown parsing, including
        after cancellation or an error.
      </p>
    </main>
  `,
})
export class MagicTextDemo {
  private readonly started = signal(false);
  private readonly stopped = signal(false);
  protected readonly citation = signal<MagicTextCitationRenderData | null>(
    null,
  );
  protected readonly chat = chatResource({
    system: magicTextSystem,
    debugName: 'magic-text',
  });
  protected readonly state = computed(() =>
    magicTextState({
      started: this.started(),
      stopped: this.stopped(),
      error: this.chat.error(),
      finishReason: this.chat.lastRunFinishReason(),
      isLoading: this.chat.isLoading(),
      isSending: this.chat.isSending(),
      isReceiving: this.chat.isReceiving(),
      isGenerating: this.chat.isGenerating(),
    }),
  );
  protected readonly text = computed(
    () => this.chat.lastAssistantMessage()?.content ?? '',
  );

  protected generate(): void {
    if (this.state().busy) return;
    this.started.set(true);
    this.stopped.set(false);
    this.citation.set(null);
    this.chat.setMessages([
      {
        id: crypto.randomUUID(),
        role: 'user',
        content:
          'Write a small packing list with a passport and charger, and cite the supplied setup documentation.',
      },
    ]);
  }

  protected cancel(): void {
    this.stopped.set(true);
    this.chat.stop();
  }

  protected selectCitation(event: MagicTextCitationClickEvent): void {
    event.mouseEvent.preventDefault();
    this.citation.set(event.citation);
  }
}
