import type * as Leaflet from 'leaflet';
import { onTestFinished, vi } from 'vitest';
import type { PixelPoint } from './pixels';

/** The media query `prefersReducedMotion` asks. */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Leaflet's namespace. Leaflet ships as CommonJS: depending on the bundler, a
 * dynamic import returns it as the namespace or under `default`.
 */
export async function leafletModule(): Promise<typeof Leaflet> {
  const module = await import('leaflet');

  return (module as unknown as { default?: typeof module }).default ?? module;
}

/** Stubs `matchMedia` so only `queries` match, until the test finishes. */
export function stubMedia(...queries: string[]): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: queries.includes(query),
  }));
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
}

/** Animation frames that run only when a test says so, on a fake clock. */
export interface FrameQueue {
  /** The frames requested and not run yet, by id. */
  readonly frames: ReadonlyMap<number, FrameRequestCallback>;
  /** Sets `performance.now()`. */
  setClock(time: number): void;
  /** Sets the clock to `time` and runs the frames queued now, once. */
  run(time: number): void;
  /**
   * Runs the queued frames, and any they ask for, `rounds` deep at the
   * current clock, letting promises settle between rounds.
   */
  settle(rounds?: number): Promise<void>;
}

/**
 * Stubs `performance.now`, `requestAnimationFrame` and
 * `cancelAnimationFrame` with a fake clock (starting at 0) and a manual
 * frame queue, until the test finishes.
 */
export function createFrameQueue(): FrameQueue {
  let clock = 0;
  let nextFrame = 1;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(nextFrame, callback);
    return nextFrame++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  onTestFinished(() => {
    frames.clear();
    vi.unstubAllGlobals();
  });
  const runPending = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) {
      callback(clock);
    }
  };

  return {
    frames,
    setClock(time) {
      clock = time;
    },
    run(time) {
      clock = time;
      runPending();
    },
    async settle(rounds = 4) {
      for (let round = 0; round < rounds; round++) {
        runPending();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
  };
}

/** A map container that reports `width` x `height` pixels to Leaflet. */
export function mapElement(width = 400, height = 300): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });

  return element;
}

/**
 * Gives every canvas a 2D context that accepts any call and does nothing
 * (jsdom has none), until the test finishes.
 */
export function stubCanvas(): void {
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  });
  const canvas = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => context as unknown as CanvasRenderingContext2D);
  onTestFinished(() => {
    canvas.mockRestore();
  });
}

/**
 * Where a plane's marker is drawn, in pixels from the map's top-left: its
 * icon's position plus the map pane's pan. A plane not on the map reads as
 * the pane's offset.
 */
export function planePixel(element: HTMLElement, hex: string): PixelPoint {
  const px = (value: string | undefined) => parseFloat(value ?? '0') || 0;
  const pane = element.querySelector<HTMLElement>('.leaflet-map-pane');
  const icon = element
    .querySelector(`[data-hex="${hex}"]`)
    ?.closest<HTMLElement>('.atc-plane-icon');

  return {
    x: px(icon?.style.left) + px(pane?.style.left),
    y: px(icon?.style.top) + px(pane?.style.top),
  };
}
