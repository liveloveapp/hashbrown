import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { chatResource } from '@hashbrownai/angular';
import { createWorkbenchStore } from '../../../runtime/workbench';
import { createProductionClient } from '../../../runtime/workbench-production-client';
import { mountProductionControls } from '../../../runtime/workbench-production-controls';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import { createWorkbenchTransport } from '../../../runtime/workbench-transport';
import {
  mountWorkbench,
  stopWorkbench,
  type WorkbenchNavigation,
} from '../../../runtime/workbench-view';
import { PRODUCTION_INITIAL_STATE } from '../../../runtime/workbench-production';

/** Runs the canonical workbench against the opt-in durable production reference. */
@Component({
  selector: 'app-production-workbench-conversation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div #shell></div>',
})
export class ProductionWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  readonly store = createWorkbenchStore('workflow');
  readonly chat = chatResource({
    system: '', // An empty SDK system creates no configured system overlay; the server pins instructions.
    state: PRODUCTION_INITIAL_STATE,
    transport: createWorkbenchTransport(
      this.store,
      undefined,
      '/api/production/run',
    ),
  });
  private readonly healthy = signal<ReturnType<typeof this.chat.value>>([]);
  private readonly shell = viewChild.required<ElementRef<HTMLElement>>('shell');
  private readonly mounted = signal<ReturnType<typeof mountWorkbench> | null>(
    null,
  );
  private readonly destroyRef = inject(DestroyRef);
  readonly client = createProductionClient(
    this.store,
    () => ({
      revision: this.chat.recovery().revision,
      busy: this.chat.isLoading() || this.chat.isResuming(),
      pending: this.chat.pendingInterrupts(),
      error: this.chat.error(),
      recoveryRequired: this.chat.recovery().required,
      finishReason: this.chat.lastRunFinishReason(),
      restore: (snapshot, options) =>
        this.chat.restoreConversation(snapshot, options),
      resume: (options) => this.chat.resume(options),
    }),
    () => this.active(),
    undefined,
    () => window.localStorage,
  );
  constructor() {
    effect(() => {
      const error = this.chat.error();
      if (!error) this.healthy.set(this.chat.value());
      this.store.recordWorkflow({
        state: this.chat.state(),
        messages: error ? this.healthy() : this.chat.value(),
        pendingInterrupts: this.chat.pendingInterrupts(),
        isLoading: this.chat.isLoading(),
        isResuming: this.chat.isResuming(),
        error,
        finishReason: this.chat.lastRunFinishReason(),
        recoveryRequired: this.chat.recovery().required,
      });
      this.client.observe();
      if (
        this.store.getSnapshot().status === 'loading' &&
        !this.chat.isLoading() &&
        !this.chat.isResuming() &&
        !this.chat.pendingInterrupts() &&
        (error ||
          this.chat.lastRunFinishReason() ||
          this.chat.recovery().required)
      )
        this.store.settle(
          error || this.chat.recovery().required ? 'error' : 'complete',
          this.chat.lastRunFinishReason(),
        );
    });
    effect(() => {
      const mounted = this.mounted();
      if (!mounted) return;
      mounted.navigation(this.navigation());
      if (!this.active()) {
        this.stop();
        mounted.pause();
      }
    });
  }
  private stop() {
    stopWorkbench(this.store, {
      isLoading: this.chat.isLoading(),
      isSending: this.chat.isSending(),
      isReceiving: this.chat.isReceiving(),
      isGenerating: this.chat.isGenerating(),
      isResuming: this.chat.isResuming(),
      stop: () => this.chat.stop(),
    });
  }
  ngAfterViewInit(): void {
    this.client.mount();
    const mounted = mountWorkbench(this.shell().nativeElement, this.store, {
      framework: 'Angular',
      managedChat: true,
      lesson: getWorkbenchLesson(window.location.search),
      send: (content) => {
        if (!this.client.sendable()) return;
        const message = this.store.send(content);
        this.client.ran();
        try {
          this.chat.sendMessage(message);
        } catch {
          this.store.settle('error');
        }
      },
      stop: () => {
        if (
          this.active() &&
          !this.store.getSnapshot().readOnly &&
          this.store.getSnapshot().cursor === null
        )
          this.stop();
      },
      reset: () => this.navigation().create(),
    });
    this.mounted.set(mounted);
    const dispose = mountProductionControls(
      mounted.live,
      this.store,
      this.client,
    );
    this.destroyRef.onDestroy(() => {
      this.client.dispose();
      this.stop();
      dispose();
      mounted.dispose();
    });
  }
}
