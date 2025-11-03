import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { Toast } from '../models/toast.models';

@Component({
  selector: 'www-toast-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.top-left]': 'isTopLeft()',
    '[class.top-center]': 'isTopCenter()',
    '[class.top-right]': 'isTopRight()',
    '[class.bottom-left]': 'isBottomLeft()',
    '[class.bottom-center]': 'isBottomCenter()',
    '[class.bottom-right]': 'isBottomRight()',
  },
  template: `
    @let toast = this.toast();
    <div
      class="toast"
      [class.success]="isSuccess()"
      [class.error]="isError()"
      [class.warning]="isWarning()"
      [class.info]="isInfo()"
      role="alert"
      [attr.aria-live]="ariaLive()"
    >
      @if (toast.icon) {
        <div class="icon">{{ toast.icon }}</div>
      }
      <div class="message">{{ toast.message }}</div>
      @if (toast.dismissible) {
        <button
          class="close"
          (click)="onDismiss()"
          aria-label="Dismiss notification"
          type="button"
        >
          ×
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    /* Top Right - slide from right */
    :host.top-right {
      animation: slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    /* Top Left - slide from left */
    :host.top-left {
      animation: slideInLeft 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes slideInLeft {
      from {
        transform: translateX(-100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    /* Top Center - slide from top */
    :host.top-center {
      animation: slideInTop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes slideInTop {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    /* Bottom Right - slide from right */
    :host.bottom-right {
      animation: slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    /* Bottom Left - slide from left */
    :host.bottom-left {
      animation: slideInLeft 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    /* Bottom Center - slide from bottom */
    :host.bottom-center {
      animation: slideInBottom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes slideInBottom {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    :host.removing {
      animation: fadeOut 0.3s cubic-bezier(0.36, 0, 0.66, -0.56);
    }

    @keyframes fadeOut {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      min-width: 280px;
      max-width: 480px;
      box-shadow: 0 8px 16px rgba(61, 60, 58, 0.24);
      border: 1px solid;
      border-radius: 12px;
      background: var(--vanilla-ivory, #faf9f0);
      font:
        400 14px/20px 'Fredoka',
        sans-serif;
    }

    .icon {
      flex-shrink: 0;
      font-size: 20px;
      line-height: 1;
    }

    .message {
      flex: 1;
      color: var(--gray-dark, #3d3c3a);
    }

    .close {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 4px;
      background: rgba(61, 60, 58, 0.08);
      color: var(--gray, #5e5c5a);
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(61, 60, 58, 0.16);
        color: var(--gray-dark, #3d3c3a);
      }
    }

    /* Success */
    .toast.success {
      border-color: var(--olive-green, #616f36);
      background: #e8ebe0;

      .icon {
        color: var(--olive-green, #616f36);
      }
    }

    /* Error */
    .toast.error {
      border-color: var(--indian-red, #b86060);
      background: #f5e5e5;

      .icon {
        color: var(--indian-red-dark, #924e4e);
      }
    }

    /* Warning */
    .toast.warning {
      border-color: var(--sunset-orange, #e88c4d);
      background: #fceee5;

      .icon {
        color: var(--sunset-orange, #e88c4d);
      }
    }

    /* Info */
    .toast.info {
      border-color: var(--sky-blue, #9ecfd7);
      background: #e8f5f7;

      .icon {
        color: var(--sky-blue-dark, #64afb5);
      }
    }
  `,
})
export class ToastItem {
  toast = input.required<Toast>();
  dismiss = output<string>();

  isSuccess = computed(() => this.toast().type === 'success');
  isError = computed(() => this.toast().type === 'error');
  isWarning = computed(() => this.toast().type === 'warning');
  isInfo = computed(() => this.toast().type === 'info');

  isTopLeft = computed(() => this.toast().position === 'top-left');
  isTopCenter = computed(() => this.toast().position === 'top-center');
  isTopRight = computed(() => this.toast().position === 'top-right');
  isBottomLeft = computed(() => this.toast().position === 'bottom-left');
  isBottomCenter = computed(() => this.toast().position === 'bottom-center');
  isBottomRight = computed(() => this.toast().position === 'bottom-right');

  ariaLive = computed(() => {
    return this.toast().type === 'error' ? 'assertive' : 'polite';
  });

  onDismiss(): void {
    this.dismiss.emit(this.toast().id);
  }
}
