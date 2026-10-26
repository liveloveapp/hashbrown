import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  chatResource,
  createTool,
  MagicText,
  type MagicTextCitationClickEvent,
} from '@hashbrownai/angular';
import { isCurrentWorkbenchError } from '../../../runtime/workbench';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import { workbenchApplicationInput } from '../../../runtime/workbench-recipe-input';
import { workbenchTextSystem } from '../../../runtime/workbench-recipes';
import { createWorkbenchTransport } from '../../../runtime/workbench-transport';
import {
  messageOrigins,
  type ProposalOrigin,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../../runtime/workbench-view';
import { createRecipeWorkbenchSession } from './recipe-workbench-session';

/** Uses genuine chat and Magic Text for live explanations and inert captured history. */
@Component({
  selector: 'app-magic-text-workbench-conversation',
  imports: [MagicText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #shell></div>
    <div #live>
      @for (
        message of session.snapshot().frame?.messages ?? [];
        track message.id
      ) {
        @if (message.role === 'user') {
          <p class="wb-user">{{ message.content }}</p>
        } @else {
          <article
            class="wb-summary wb-markdown"
            aria-label="Markdown explanation"
          >
            <hb-magic-text
              [text]="
                message.recipe?.kind === 'text'
                  ? message.recipe.markdown
                  : message.content
              "
              [isComplete]="complete(message.id)"
              [caret]="busy(message.id)"
              (linkClick)="$event.mouseEvent.preventDefault()"
              (citationClick)="inspect($event, message.id)"
            />
          </article>
        }
      }
      @if (
        (session.snapshot().frame?.status ?? session.snapshot().status) ===
        'error'
      ) {
        <p role="alert">The explanation failed. Send a message to try again.</p>
      }
      @if (
        (session.snapshot().frame?.status ?? session.snapshot().status) ===
        'cancelled'
      ) {
        <p role="status">
          Explanation stopped. Partial text is retained; send a message to
          continue.
        </p>
      }
    </div>`,
})
export class MagicTextWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  protected readonly session = createRecipeWorkbenchSession(
    'text',
    this.active,
    this.navigation,
    {
      send: (prompt) => this.send(prompt),
      stop: () => this.stop(),
      reset: () => this.reset(),
    },
  );
  private readonly shell = viewChild.required<ElementRef<HTMLElement>>('shell');
  private readonly live = viewChild.required<ElementRef<HTMLElement>>('live');
  private readonly users = signal<Readonly<Record<string, ProposalOrigin>>>({});
  private readonly chat = chatResource({
    system: workbenchTextSystem,
    transport: createWorkbenchTransport(
      this.session.store,
      undefined,
      getWorkbenchLesson(window.location.search).endpoint,
    ),
    tools: [
      createTool({
        name: 'readContext',
        description:
          'Read the application-owned plan and revision. Never changes state.',
        handler: async () => {
          const result = workbenchApplicationInput(
            this.session.store.getSnapshot().application,
          );
          this.session.store.record('tool', { name: 'readContext', result });
          return result;
        },
      }),
    ],
  });
  private readonly healthyMessages = signal<ReturnType<typeof this.chat.value>>(
    [],
  );
  private readonly origins = computed(() =>
    messageOrigins(this.healthyMessages(), this.users()),
  );
  private previousError: unknown;
  private recorded = '';
  private requestId = '';
  constructor() {
    effect(() => {
      if (!this.chat.error()) this.healthyMessages.set(this.chat.value());
    });
    effect(() => {
      const snapshot = this.session.snapshot();
      if (snapshot.status !== 'loading') return;
      if (
        this.chat.error() &&
        isCurrentWorkbenchError(
          snapshot,
          this.healthyMessages(),
          this.chat.error(),
          this.previousError,
        )
      ) {
        this.session.store.settle('error');
        return;
      }
      if (this.chat.error()) return;
      const message = this.chat.lastAssistantMessage();
      if (!message || this.origins()[message.id]?.turn !== snapshot.turn)
        return;
      if (
        typeof message.content === 'string' &&
        message.content !== this.recorded
      ) {
        this.recorded = message.content;
        this.session.store.recordRecipe(
          { kind: 'text', markdown: message.content },
          this.requestId,
        );
      }
      if (!this.chat.isLoading() && this.chat.lastRunFinishReason())
        this.session.store.settle(
          this.chat.lastRunFinishReason() === 'stop' &&
            !this.chat.pendingInterrupts()
            ? 'complete'
            : 'error',
          this.chat.lastRunFinishReason(),
        );
    });
  }
  protected complete(id: string): boolean {
    const frame = this.session.snapshot().frame;
    return frame?.status !== 'loading' || frame.messages.at(-1)?.id !== id;
  }
  protected busy(id: string): boolean {
    const snapshot = this.session.snapshot();
    return (
      snapshot.cursor === null &&
      snapshot.status === 'loading' &&
      snapshot.frame?.messages.at(-1)?.id === id
    );
  }
  protected inspect(event: MagicTextCitationClickEvent, origin: string): void {
    event.mouseEvent.preventDefault();
    if (this.session.store.getSnapshot().cursor === null && event.citation.url)
      this.session.store.inspectCitation(
        {
          id: event.citation.id,
          number: Number(event.citation.number),
          url: event.citation.url,
        },
        origin,
      );
  }
  private send(content: string): void {
    this.previousError = this.chat.error();
    const user = this.session.store.send(content);
    this.requestId = user.id;
    const snapshot = this.session.store.getSnapshot();
    this.users.update((users) => ({
      ...users,
      [user.id]: {
        turn: snapshot.turn,
        revision: snapshot.application.revision,
      },
    }));
    this.recorded = '';
    this.chat.sendMessage(user);
  }
  private stop(): void {
    stopWorkbench(this.session.store, {
      isLoading: this.chat.isLoading(),
      isResuming: this.chat.isResuming(),
      stop: () => this.chat.stop(),
    });
  }
  private reset(): void {
    this.stop();
    this.chat.setMessages([]);
    this.healthyMessages.set([]);
    this.users.set({});
    this.recorded = '';
    this.requestId = '';
  }
  ngAfterViewInit(): void {
    this.session.mount(this.shell().nativeElement, this.live().nativeElement);
  }
}
