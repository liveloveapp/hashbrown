import { CursorOverlayService } from './cursor-overlay.service';
import { inject } from '@angular/core';

export class DomDriver {
  private cursor = inject(CursorOverlayService);

  constructor(private speed = 1) {}

  setSpeed(speed: number) {
    this.speed = Math.max(0.1, speed);
  }

  async waitForSelector(
    selector: string,
    opts?: { timeoutMs?: number; signal?: AbortSignal },
  ) {
    const timeoutMs = opts?.timeoutMs ?? 5000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (opts?.signal?.aborted)
        throw new DOMException('Aborted', 'AbortError');
      const el = document.querySelector(selector);
      if (el) return el as HTMLElement;
      await this.delay(50, opts?.signal);
    }
    throw new Error(`waitForSelector timeout: ${selector}`);
  }

  async click(selector: string, opts?: { signal?: AbortSignal }) {
    const el = (await this.waitForSelector(selector, {
      signal: opts?.signal,
    })) as HTMLElement;
    await this.cursor.moveTo(el, {
      click: true,
      durationMs: 2_500 / this.speed,
    });
    (el as HTMLElement).click();
  }

  async typeText(
    selector: string,
    text: string,
    perCharDelayMs = 60,
    opts?: { signal?: AbortSignal },
  ) {
    const el = (await this.waitForSelector(selector, {
      signal: opts?.signal,
    })) as HTMLInputElement | HTMLTextAreaElement;
    el.focus();
    (el as any).value = '';
    for (const ch of text) {
      if (opts?.signal?.aborted)
        throw new DOMException('Aborted', 'AbortError');
      (el as any).value += ch;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await this.delay(perCharDelayMs / this.speed, opts?.signal);
    }
  }

  async delay(durationMs: number, signal?: AbortSignal) {
    const scaled = Math.max(0, durationMs / this.speed);
    return new Promise<void>((resolve, reject) => {
      const id = setTimeout(() => resolve(), scaled);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(id);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }

  async chatSend(text: string, opts?: { signal?: AbortSignal }) {
    // ensure focus and content in composer
    await this.typeText('#chat-input', text, 60, opts);
    // click send button
    const btn = document.querySelector(
      'button.send-button',
    ) as HTMLButtonElement | null;
    if (btn) btn.click();
  }

  async chatWait(
    until: 'idle' | 'response',
    timeoutMs = 10000,
    signal?: AbortSignal,
  ) {
    const deadline = Date.now() + timeoutMs;
    const isLoading = () => Boolean(document.querySelector('.chat-loading'));
    if (until === 'idle') {
      // wait until not loading
      while (Date.now() < deadline) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (!isLoading()) return;
        await this.delay(50, signal);
      }
      throw new Error('chatWait idle timeout');
    } else {
      // response: wait for loading to appear then disappear
      let seenBusy = false;
      while (Date.now() < deadline) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (isLoading()) seenBusy = true;
        if (seenBusy && !isLoading()) return;
        await this.delay(50, signal);
      }
      throw new Error('chatWait response timeout');
    }
  }
}
