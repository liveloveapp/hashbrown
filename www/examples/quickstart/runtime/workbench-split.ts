import {
  clampWorkbenchSplit,
  stepWorkbenchSplit,
  workbenchLayoutDefaults,
  type WorkbenchLayoutStore,
} from './workbench-layout';

/** Options for {@link createWorkbenchSplit}. */
export interface WorkbenchSplitOptions {
  readonly chat: HTMLElement;
  readonly inspector: HTMLElement;
  readonly layout: WorkbenchLayoutStore;
}

/**
 * Creates the keyboard- and pointer-operable separator between the chat and
 * inspector panes. The element is created once; `dispose` releases the layout
 * subscription and any in-flight drag listeners.
 *
 * @param options - The panes to measure and the layout store to update.
 * @returns The separator element and a cleanup function.
 */
export function createWorkbenchSplit(options: WorkbenchSplitOptions): {
  readonly element: HTMLElement;
  readonly dispose: () => void;
} {
  const { chat, inspector, layout } = options;
  const handle = document.createElement('div');
  handle.className = 'wb-split';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Resize chat and inspector');
  handle.setAttribute('aria-valuemin', '25');
  handle.setAttribute('aria-valuemax', '75');
  handle.tabIndex = 0;

  const svgNs = 'http://www.w3.org/2000/svg';
  const grip = document.createElementNS(svgNs, 'svg');
  grip.setAttribute('class', 'wb-grip');
  grip.setAttribute('viewBox', '0 0 10 22');
  grip.setAttribute('aria-hidden', 'true');
  for (const points of ['4 7 1 11 4 15', '6 7 9 11 6 15']) {
    const line = document.createElementNS(svgNs, 'polyline');
    line.setAttribute('points', points);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'currentColor');
    grip.append(line);
  }
  handle.append(grip);

  const sync = () =>
    handle.setAttribute('aria-valuenow', String(layout.get().split));
  sync();
  const unsubscribe = layout.subscribe(sync);

  let stopDrag: (() => void) | undefined;
  handle.addEventListener('pointerdown', (event) => {
    stopDrag?.();
    const left = chat.getBoundingClientRect().left;
    const width = inspector.getBoundingClientRect().right - left;
    const pointerId = (event as PointerEvent).pointerId;
    handle.setPointerCapture?.(pointerId);
    handle.classList.add('wb-dragging');
    const move = (e: Event) => {
      if (width <= 0) return;
      layout.set({
        split: clampWorkbenchSplit(
          (((e as MouseEvent).clientX - left) / width) * 100,
        ),
      });
    };
    const end = () => {
      handle.classList.remove('wb-dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      stopDrag = undefined;
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    stopDrag = end;
    event.preventDefault();
  });
  handle.addEventListener('keydown', (event) => {
    const next = stepWorkbenchSplit(layout.get().split, event.key);
    if (next === null) return;
    event.preventDefault();
    layout.set({ split: next });
  });
  handle.addEventListener('dblclick', () =>
    layout.set({ split: workbenchLayoutDefaults.split }),
  );

  return {
    element: handle,
    dispose: () => {
      stopDrag?.();
      unsubscribe();
    },
  };
}
