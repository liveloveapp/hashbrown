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
import { createRuntime, createRuntimeFunction } from '@hashbrownai/angular';
import { createWorkbenchStore } from '../../../runtime/workbench';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import {
  workbenchJavaScriptPlanResultSchema,
  workbenchJavaScriptReadPlanSchema,
} from '../../../runtime/workbench-javascript';
import {
  createWorkbenchJavaScriptSession,
  mountWorkbenchJavaScriptSession,
} from '../../../runtime/workbench-javascript-session';
import {
  mountWorkbench,
  type WorkbenchNavigation,
} from '../../../runtime/workbench-view';

/** Runs explicit visible scripts through Angular's native Hashbrown QuickJS factories. */
@Component({
  selector: 'app-runtime-workbench-conversation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div #shell></div>',
})
export class RuntimeWorkbenchConversation implements AfterViewInit {
  readonly active = input.required<boolean>();
  readonly navigation = input.required<WorkbenchNavigation>();
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('shell');
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = createWorkbenchStore('text');
  private readonly mounted = signal<{
    shell: ReturnType<typeof mountWorkbench>;
    controls: ReturnType<typeof mountWorkbenchJavaScriptSession>;
  } | null>(null);
  private readonly controller = createWorkbenchJavaScriptSession({
    store: this.store,
    active: () => this.active(),
    execute: (code, signal) => this.runtime.run(code, signal),
  });
  private readonly runtime = createRuntime({
    timeout: 1_000,
    functions: [
      createRuntimeFunction({
        name: 'readPlan',
        description:
          'Read the application-owned plan at the exact current revision without changing it.',
        args: workbenchJavaScriptReadPlanSchema,
        result: workbenchJavaScriptPlanResultSchema,
        handler: async (args, signal) => this.controller.readPlan(args, signal),
      }),
    ],
  });
  constructor() {
    effect(() => {
      const active = this.active();
      const mounted = this.mounted();
      if (!mounted) return;
      mounted.shell.navigation(this.navigation());
      if (!active) {
        this.controller.stop();
        mounted.shell.pause();
      }
      mounted.controls.update();
    });
    this.destroyRef.onDestroy(() => {
      this.controller.dispose();
      this.mounted()?.controls.dispose();
      this.mounted()?.shell.dispose();
    });
  }
  /** Mounts shared controls only after Angular provides the native host element. */
  ngAfterViewInit(): void {
    const shell = mountWorkbench(this.host().nativeElement, this.store, {
      framework: 'Angular',
      managedChat: true,
      lesson: getWorkbenchLesson(window.location.search),
      send: (code) => {
        void this.controller.run(code);
      },
      stop: () => this.controller.stop(),
      reset: () => this.navigation().create(),
    });
    const controls = mountWorkbenchJavaScriptSession(
      shell.live,
      this.store,
      this.controller,
    );
    this.mounted.set({ shell, controls });
  }
}
