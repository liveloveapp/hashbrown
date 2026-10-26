import { DestroyRef, effect, inject, signal, type Signal } from '@angular/core';
import { createWorkbenchStore } from '../../../runtime/workbench';
import { getWorkbenchLesson } from '../../../runtime/workbench-lessons';
import {
  mountWorkbench,
  type WorkbenchNavigation,
} from '../../../runtime/workbench-view';

/** Composes one Angular recipe's capture session and framework-managed shell lifecycle. */
export function createRecipeWorkbenchSession(
  format: 'text' | 'predictions' | 'selection',
  active: Signal<boolean>,
  navigation: Signal<WorkbenchNavigation>,
  commands: {
    send: (prompt: string) => void;
    stop: () => void;
    reset: () => void;
  },
) {
  const store = createWorkbenchStore(format);
  const snapshot = signal(store.getSnapshot());
  const mounted = signal<ReturnType<typeof mountWorkbench> | null>(null);
  const unsubscribe = store.subscribe(() => snapshot.set(store.getSnapshot()));
  inject(DestroyRef).onDestroy(() => {
    commands.stop();
    unsubscribe();
    mounted()?.dispose();
  });
  effect(() => {
    const shell = mounted();
    if (!shell) return;
    shell.navigation(navigation());
    if (!active()) {
      commands.stop();
      shell.pause();
    }
  });
  return {
    store,
    snapshot,
    mount: (host: HTMLElement, live: HTMLElement) => {
      const shell = mountWorkbench(host, store, {
        framework: 'Angular',
        lesson: getWorkbenchLesson(window.location.search),
        managedChat: true,
        ...commands,
      });
      shell.live.append(live);
      mounted.set(shell);
    },
  };
}
