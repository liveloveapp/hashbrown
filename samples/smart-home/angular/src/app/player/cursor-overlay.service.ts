import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CursorOverlayService {
  // simple state for position and visibility
  readonly x = signal(0);
  readonly y = signal(0);
  readonly visible = signal(false);

  async moveTo(el: Element, opts?: { click?: boolean; durationMs?: number }) {
    const rect = (el as HTMLElement).getBoundingClientRect();
    const targetX = Math.round(rect.left + rect.width / 2);
    const targetY = Math.round(rect.top + rect.height / 2);
    await this.moveToPoint(targetX, targetY, opts?.durationMs ?? 2_500);
    if (opts?.click) {
      await this.clickPulse();
    }
  }

  async moveToPoint(x: number, y: number, durationMs = 2_500) {
    const startX = this.x();
    const startY = this.y();
    const start = performance.now();
    this.visible.set(true);

    return new Promise<void>((resolve) => {
      const step = (t: number) => {
        const elapsed = t - start;
        const p = Math.min(1, elapsed / durationMs);
        const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p; // easeInOut
        this.x.set(Math.round(startX + (x - startX) * ease));
        this.y.set(Math.round(startY + (y - startY) * ease));
        if (p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  private async clickPulse() {
    // Brief show/hide to indicate click
    this.visible.set(false);
    await new Promise((r) => setTimeout(r, 600));
    this.visible.set(true);
    await new Promise((r) => setTimeout(r, 1_200));
  }
}
