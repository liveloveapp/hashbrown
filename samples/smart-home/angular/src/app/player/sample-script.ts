import { Injectable, signal } from '@angular/core';
import { Scenario, Step } from 'samples-types';
import { DomDriver } from './dom-driver';

@Injectable({ providedIn: 'root' })
export class SampleScriptService {
  readonly status = signal<
    'idle' | 'playing' | 'paused' | 'completed' | 'error'
  >('idle');
  readonly index = signal(0);
  readonly speed = signal(1);
  readonly steps = signal<Step[]>([]);
  readonly total = signal(0);

  private abortController: AbortController | null = null;
  private driver = new DomDriver(1);

  registerScenario(s: Scenario) {
    this.steps.set(s.steps);
    this.total.set(s.steps.length);
  }

  setSpeed(speed: number) {
    this.speed.set(speed);
    this.driver.setSpeed(speed);
  }

  async start() {
    // if paused, resume by continuing with a new controller
    if (this.status() === 'playing') return;
    this.status.set('playing');
    this.abortController = new AbortController();
    const steps = this.steps();
    try {
      for (let i = this.index(); i < steps.length; i++) {
        this.index.set(i);
        await this.runStep(steps[i], this.abortController.signal);
        // emit progress via gateway
        this.onProgress?.(i, steps.length);
      }
      this.status.set('completed');
      this.onComplete?.();
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        this.status.set('paused');
        return;
      }
      this.status.set('error');
      this.onError?.('engine', (err as Error)?.message ?? 'Unknown error');
    }
  }

  pause() {
    if (this.abortController) this.abortController.abort();
  }

  async restart(opts?: { hardReset?: boolean; speed?: number }) {
    if (opts?.speed != null) this.setSpeed(opts.speed);
    if (opts?.hardReset) {
      globalThis.location.reload();
      return;
    }
    this.index.set(0);
    await this.start();
  }

  private async runStep(step: Step, signal: AbortSignal) {
    switch (step.kind) {
      case 'click':
        // If clicking add-scene-button is required, it might be hidden until FAB is opened
        if (step.selector === '#add-scene-button') {
          const fab = document.querySelector(
            'app-fab-speed-dial button[mat-fab]',
          ) as HTMLElement | null;
          if (fab && !document.querySelector('#add-scene-button')) {
            fab.click();
            await this.driver.delay(1_500, signal);
          }
        }
        await this.driver.click(step.selector, { signal });
        break;
      case 'type':
        await this.driver.typeText(
          step.selector,
          step.text,
          step.perCharDelayMs ?? 60,
          { signal },
        );
        break;
      case 'waitFor':
        await this.driver.waitForSelector(step.selector, {
          timeoutMs: step.timeoutMs ?? 5000,
          signal,
        });
        break;
      case 'delay':
        await this.driver.delay(step.durationMs, signal);
        break;
      case 'chat.send':
        await this.driver.chatSend(step.text, { signal });
        break;
      case 'chat.wait':
        await this.driver.chatWait(step.until, step.timeoutMs ?? 10000, signal);
        break;
      default:
        throw new Error(`Unknown step: ${(step as any).kind}`);
    }
  }

  // Gateway callbacks
  onProgress?: (index: number, total: number) => void;
  onComplete?: () => void;
  onError?: (code: string, message: string) => void;
}
