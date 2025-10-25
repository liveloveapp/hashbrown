import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { ToastService } from '../services/ToastService';
import { ToastItem } from './ToastItem';

@Component({
  selector: 'www-toast-container',
  imports: [ToastItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Top Positions -->
    @if (topLeft().length > 0) {
      <div class="toast-position top-left">
        @for (toast of topLeft(); track toast.id) {
          <www-toast-item [toast]="toast" (dismiss)="onDismiss($event)" />
        }
      </div>
    }

    @if (topCenter().length > 0) {
      <div class="toast-position top-center">
        @for (toast of topCenter(); track toast.id) {
          <www-toast-item [toast]="toast" (dismiss)="onDismiss($event)" />
        }
      </div>
    }

    @if (topRight().length > 0) {
      <div class="toast-position top-right">
        @for (toast of topRight(); track toast.id) {
          <www-toast-item [toast]="toast" (dismiss)="onDismiss($event)" />
        }
      </div>
    }

    <!-- Bottom Positions -->
    @if (bottomLeft().length > 0) {
      <div class="toast-position bottom-left">
        @for (toast of bottomLeft(); track toast.id) {
          <www-toast-item [toast]="toast" (dismiss)="onDismiss($event)" />
        }
      </div>
    }

    @if (bottomCenter().length > 0) {
      <div class="toast-position bottom-center">
        @for (toast of bottomCenter(); track toast.id) {
          <www-toast-item [toast]="toast" (dismiss)="onDismiss($event)" />
        }
      </div>
    }

    @if (bottomRight().length > 0) {
      <div class="toast-position bottom-right">
        @for (toast of bottomRight(); track toast.id) {
          <www-toast-item [toast]="toast" (dismiss)="onDismiss($event)" />
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9999;
      overflow: hidden;
    }

    .toast-position {
      position: fixed;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: auto;
      padding: 16px;
      max-height: 100vh;
      overflow: visible;
    }

    /* Top positions */
    .toast-position.top-left {
      top: 0;
      left: 0;
    }

    .toast-position.top-center {
      top: 0;
      left: 50%;
      transform: translateX(-50%);
    }

    .toast-position.top-right {
      top: 0;
      right: 0;
    }

    /* Bottom positions */
    .toast-position.bottom-left {
      bottom: 0;
      left: 0;
    }

    .toast-position.bottom-center {
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
    }

    .toast-position.bottom-right {
      bottom: 0;
      right: 0;
    }

    /* Mobile responsive - center all toasts */
    @media (max-width: 768px) {
      .toast-position.top-left,
      .toast-position.top-right {
        left: 50%;
        right: auto;
        transform: translateX(-50%);
      }

      .toast-position.bottom-left,
      .toast-position.bottom-right {
        left: 50%;
        right: auto;
        transform: translateX(-50%);
      }

      .toast-position {
        padding: 12px;
      }

      /* Ensure toasts stack properly on mobile */
      .toast-position {
        align-items: center;
      }
    }

    @media (max-width: 480px) {
      .toast-position {
        padding: 8px;
        left: 0;
        right: 0;
        transform: none;
      }

      .toast-position.top-center,
      .toast-position.bottom-center {
        left: 0;
        right: 0;
        transform: none;
      }
    }
  `,
})
export class ToastContainer {
  private toastService = inject(ToastService);

  private readonly allToasts = this.toastService.allToasts;

  topLeft = computed(() =>
    this.allToasts().filter((toast) => toast.position === 'top-left'),
  );
  topCenter = computed(() =>
    this.allToasts().filter((toast) => toast.position === 'top-center'),
  );
  topRight = computed(() =>
    this.allToasts().filter((toast) => toast.position === 'top-right'),
  );
  bottomLeft = computed(() =>
    this.allToasts().filter((toast) => toast.position === 'bottom-left'),
  );
  bottomCenter = computed(() =>
    this.allToasts().filter((toast) => toast.position === 'bottom-center'),
  );
  bottomRight = computed(() =>
    this.allToasts().filter((toast) => toast.position === 'bottom-right'),
  );

  onDismiss(id: string): void {
    this.toastService.dismiss(id);
  }
}
