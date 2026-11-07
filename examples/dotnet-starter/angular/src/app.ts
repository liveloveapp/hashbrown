import { Component, computed, signal } from '@angular/core';
import { chatResource, createTool } from '@hashbrownai/angular';
import {
  createBrowserReader,
  decisions,
  newConversation,
  noteSchema,
  type OutcomeChoice,
  readRecovery,
  rememberThread,
  selectedThread,
  settlement,
  system,
} from '../../shared/conversation';

/** Standalone signal-driven public Angular client using the real native endpoint. */
@Component({
  selector: 'starter-app',
  standalone: true,
  template: `<main>
    <h1>Hashbrown .NET starter · Angular</h1>
    <p>
      Development identity only. Native approval is a workflow decision;
      application permissions remain server-owned.
    </p>
    <small data-testid="thread">Thread: {{ threadId }}</small>
    <button type="button" (click)="newConversation()" [disabled]="busy()">
      New conversation
    </button>
    <section>
      <label
        >Message<input
          data-testid="prompt"
          [value]="prompt()"
          (input)="prompt.set($any($event.target).value)"
      /></label>
      <button
        data-testid="send"
        type="button"
        [disabled]="
          busy() ||
          !!chat.pendingConversationRecovery() ||
          !!chat.pendingInterrupts() ||
          chat.recovery().required
        "
        (click)="send()"
      >
        Send
      </button>
      <button
        data-testid="stop"
        type="button"
        [disabled]="!active()"
        (click)="act(stop)"
      >
        Interrupt running work
      </button>
      <button
        data-testid="recover"
        type="button"
        [disabled]="
          busy() ||
          !!chat.pendingConversationRecovery() ||
          !!chat.pendingInterrupts()
        "
        (click)="recover()"
      >
        Recover this conversation
      </button>
    </section>
    <section>
      <h2>Browser tool</h2>
      <label
        >Local note<input
          data-testid="note"
          [value]="note()"
          (input)="note.set($any($event.target).value)"
      /></label>
      <button
        data-testid="browser-release"
        type="button"
        [disabled]="!browserPending()"
        (click)="reader.release(note())"
      >
        Release browser result
      </button>
      <small data-testid="browser-pending">{{
        browserPending() ? 'Browser read waiting' : 'No browser read waiting'
      }}</small>
    </section>
    @if (chat.pendingInterrupts(); as batch) {
      @if (!chat.pendingConversationRecovery()) {
        <section>
          <h2>Native approval</h2>
          @for (item of batch.interrupts; track item.id) {
            <p>{{ item.message ?? item.reason }}</p>
          }
          @for (decision of decisionOptions; track decision) {
            <button
              [attr.data-testid]="'approval-' + decision"
              type="button"
              [disabled]="busy()"
              (click)="resume(decision)"
            >
              {{ decision }}
            </button>
          }
        </section>
      }
    }
    @if (chat.pendingConversationRecovery(); as pending) {
      <section>
        <h2>Recovered browser work</h2>
        <p>
          Supply an already known result or acknowledge that it is unavailable.
          Recovery never reruns the original browser handler.
        </p>
        @for (call of pending.toolCalls; track call.id) {
          <fieldset>
            <legend>{{ call.name }} · {{ call.id }}</legend>
            <pre>{{ json(call.arguments) }}</pre>
            <label
              >Outcome<select
                data-testid="recovery-outcome"
                [value]="choices()[call.id]?.status ?? 'unavailable'"
                (change)="chooseStatus(call.id, $any($event.target).value)"
              >
                <option value="unavailable">
                  Result unavailable; do not replay
                </option>
                <option value="result">Already known result</option>
              </select></label
            >
            <label
              >Known JSON result<textarea
                data-testid="recovery-json"
                [value]="choices()[call.id]?.json ?? ''"
                (input)="choose(call.id, { json: $any($event.target).value })"
              ></textarea>
            </label>
          </fieldset>
        }
        <p>
          Apply the following decision to every genuine protected approval in
          this complete batch.
        </p>
        @for (decision of decisionOptions; track decision) {
          <button
            [attr.data-testid]="'settle-' + decision"
            type="button"
            [disabled]="busy()"
            (click)="settle(decision)"
          >
            Settle all · {{ decision }}
          </button>
        }
      </section>
    }
    <p data-testid="status" role="status">{{ status() }}</p>
    @if (chat.error(); as error) {
      <p class="error" data-testid="error">{{ error.message }}</p>
    }
    <section>
      <h2>Conversation</h2>
      <pre data-testid="messages">{{ messages() }}</pre>
    </section>
    <section>
      <h2>Recovery diagnostics</h2>
      <pre data-testid="diagnostics">{{
        json(chat.recovery().diagnostics ?? [])
      }}</pre>
    </section>
  </main>`,
})
export class App {
  readonly threadId = selectedThread();
  readonly prompt = signal('Look up SFO and read my browser note.');
  readonly note = signal('A local browser note.');
  readonly browserPending = signal(false);
  readonly reader = createBrowserReader((value) =>
    this.browserPending.set(value),
  );
  readonly choices = signal<Readonly<Record<string, OutcomeChoice>>>({});
  readonly status = signal('Ready.');
  readonly reading = signal(false);
  readonly decisionOptions = ['approve', 'decline', 'cancel'] as const;
  readonly tools = [
    createTool({
      name: 'readBrowserNote',
      description: 'Read the local browser note after the user releases it.',
      schema: noteSchema,
      handler: this.reader.read,
    }),
  ];
  readonly chat = chatResource({
    system,
    tools: this.tools,
    threadId: this.threadId,
  });
  readonly active = computed(
    () => this.chat.isLoading() || this.chat.isResuming(),
  );
  readonly busy = computed(() => this.active() || this.reading());
  readonly messages = computed(() =>
    this.json(this.chat.hasValue() ? this.chat.value() : []),
  );
  readonly newConversation = newConversation;
  readonly stop = () => this.chat.stop();
  /** Renders untrusted history as ordinary escaped text. */
  json(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }
  /** Applies a user action and reports safe client errors. */
  act(action: () => void): void {
    try {
      rememberThread(this.threadId);
      action();
    } catch (error) {
      this.status.set(
        error instanceof Error ? error.message : 'Action refused.',
      );
    }
  }
  /** Sends a fresh user message through the actual resource. */
  send(): void {
    this.act(() =>
      this.chat.sendMessage({ role: 'user', content: this.prompt() }),
    );
  }
  /** Settles the complete genuine native interrupt batch. */
  resume(decision: 'approve' | 'decline' | 'cancel'): void {
    const batch = this.chat.pendingInterrupts();
    if (batch)
      this.act(() =>
        this.chat.resume({
          batchId: batch.id,
          entries: decisions(batch.interrupts, decision),
        }),
      );
  }
  /** Records one explicit original browser outcome choice. */
  choose(id: string, change: Partial<OutcomeChoice>): void {
    this.choices.update((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] ?? { status: 'unavailable', json: '' }),
        ...change,
      },
    }));
  }
  /** Narrows the visible browser-outcome selection. */
  chooseStatus(id: string, value: string): void {
    this.choose(id, { status: value === 'result' ? 'result' : 'unavailable' });
  }
  /** Settles every recovered browser outcome and protected approval together. */
  settle(decision: 'approve' | 'decline' | 'cancel'): void {
    const pending = this.chat.pendingConversationRecovery();
    if (pending)
      this.act(() =>
        this.chat.resumeConversationRecovery(
          settlement(pending, this.choices(), decision),
        ),
      );
  }
  /** Restores canonical history without scheduling any tool or provider work. */
  async recover(): Promise<void> {
    const revision = this.chat.recovery().revision;
    this.reading.set(true);
    try {
      rememberThread(this.threadId);
      const envelope = await readRecovery(
        this.threadId,
        this.chat.getRecoveryConfiguration(),
      );
      this.status.set(
        envelope.reason
          ? `${envelope.disposition}: ${envelope.reason}`
          : envelope.disposition,
      );
      if (
        envelope.snapshot &&
        ['Pending', 'Completed'].includes(envelope.disposition)
      ) {
        this.chat.restoreConversation(envelope.snapshot, {
          expectedRevision: revision,
        });
        this.choices.set(
          Object.fromEntries(
            (envelope.snapshot.pendingBrowserRecovery?.callIds ?? []).map(
              (id) => [id, { status: 'unavailable', json: '' }],
            ),
          ),
        );
      }
    } catch (error) {
      this.status.set(
        error instanceof Error ? error.message : 'Recovery refused.',
      );
    } finally {
      this.reading.set(false);
    }
  }
}
