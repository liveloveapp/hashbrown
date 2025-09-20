import { Component, computed, inject } from '@angular/core';
import { CursorOverlayService } from './cursor-overlay.service';
import { SampleGatewayService } from './sample-gateway';

@Component({
  selector: 'app-cursor-overlay',
  standalone: true,
  template: `
    @if (visible()) {
      <svg
        [style.left.px]="x() - 8"
        [style.top.px]="y() - 8"
        viewBox="0 0 16 16"
        width="16"
        height="16"
      >
        <circle
          cx="8"
          cy="8"
          r="7"
          stroke="#333"
          stroke-width="2"
          fill="#fff"
        />
      </svg>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483647;
    }
    svg {
      position: absolute;
    }
  `,
})
export class CursorOverlayComponent {
  private svc = inject(CursorOverlayService);
  private gateway = inject(SampleGatewayService);
  x = computed(() => this.svc.x());
  y = computed(() => this.svc.y());
  visible = computed(() => this.svc.visible());
}
