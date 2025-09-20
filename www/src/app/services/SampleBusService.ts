import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import {
  SAMPLE_MESSAGE_VERSION,
  SampleCommand,
  SampleEvent,
} from 'samples-types';

function createMeta(source: 'parent' | 'embed', origin: string) {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
    ts: Date.now(),
    source,
    origin,
    version: SAMPLE_MESSAGE_VERSION,
  } as const;
}

@Injectable({ providedIn: 'root' })
export class SampleBusService {
  private platformId = inject(PLATFORM_ID);

  // window + iframe tracking
  private iframeEl: HTMLIFrameElement | null = null;
  private childWin: Window | null = null;

  // state signals
  readonly ready = signal(false);
  readonly status = signal<
    'idle' | 'ready' | 'playing' | 'paused' | 'completed' | 'error'
  >('idle');
  readonly progress = signal<{ stepIndex: number; total: number } | null>(null);
  readonly parentOrigin = signal<string>('');
  readonly iframeOrigin = signal<string>('');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.parentOrigin.set(globalThis.location.origin);
      globalThis.addEventListener('message', this.onMessage, false);
    }
  }

  connect(iframe: HTMLIFrameElement, iframeUrl: string) {
    if (!isPlatformBrowser(this.platformId)) return;
    this.iframeEl = iframe;
    this.childWin = iframe.contentWindow;
    try {
      const url = new URL(iframeUrl, globalThis.location.href);
      this.iframeOrigin.set(url.origin);
    } catch {
      // ignore
    }
  }

  disconnect() {
    this.iframeEl = null;
    this.childWin = null;
  }

  start(payload?: { scenarioId?: string; speed?: number }) {
    this.post({ type: 'sample/start', payload } as SampleCommand);
  }

  pause() {
    this.post({ type: 'sample/pause' } as SampleCommand);
  }

  restart(payload?: {
    scenarioId?: string;
    hardReset?: boolean;
    speed?: number;
  }) {
    this.post({ type: 'sample/restart', payload } as SampleCommand);
  }

  setSpeed(speed: number) {
    this.post({
      type: 'sample/set-speed',
      payload: { speed },
    } as SampleCommand);
  }

  private onMessage = (event: MessageEvent) => {
    if (!isPlatformBrowser(this.platformId)) return;
    const expectedOrigin = this.iframeOrigin();
    if (!expectedOrigin || event.origin !== expectedOrigin) return;

    const data = event.data as SampleEvent | unknown;
    if (!data || typeof (data as any).type !== 'string') return;

    const type = (data as any).type as string;
    switch (type) {
      case 'sample/ready':
        this.ready.set(true);
        this.status.set('ready');
        break;
      case 'sample/progress':
        this.progress.set((data as any).payload);
        this.status.set('playing');
        break;
      case 'sample/complete':
        this.status.set('completed');
        break;
      case 'sample/error':
        this.status.set('error');
        break;
      default:
        // ignore
        break;
    }
  };

  private post(command: SampleCommand) {
    if (!isPlatformBrowser(this.platformId)) return;
    const target = this.childWin;
    const origin = this.iframeOrigin();
    if (!target || !origin) return;

    const meta = createMeta('parent', this.parentOrigin());
    const msg: SampleCommand = {
      ...(command as any),
      meta,
    };
    target.postMessage(msg, origin);
  }
}
