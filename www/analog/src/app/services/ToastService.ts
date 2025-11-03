import { Injectable, signal } from '@angular/core';
import type { Toast, ToastOptions } from '../models/toast.models';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toasts = signal<Toast[]>([]);
  private nextId = 0;

  /**
   * Read-only signal containing all active toast notifications.
   * Use this to reactively display toasts in your UI.
   */
  readonly allToasts = this.toasts.asReadonly();

  private generateId(): string {
    return `toast-${++this.nextId}-${Date.now()}`;
  }

  /**
   * Display a toast notification with customizable options.
   *
   * @param message - The text content to display in the toast
   * @param options - Configuration options for the toast
   * @returns The unique ID of the created toast
   *
   * @example
   * ```ts
   * toastService.show('Hello world', {
   *   type: 'info',
   *   position: 'top-right',
   *   duration: 3000
   * });
   * ```
   */
  show(message: string, options: ToastOptions = {}): string {
    const id = this.generateId();
    const toast: Toast = {
      id,
      message,
      type: options.type ?? 'info',
      duration: options.duration ?? 5000,
      position: options.position ?? 'top-right',
      dismissible: options.dismissible ?? true,
      icon: options.icon,
    };

    this.toasts.update((toasts) => [...toasts, toast]);

    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, toast.duration);
    }

    return id;
  }

  /**
   * Display a success toast notification.
   *
   * @param message - The success message to display
   * @param options - Configuration options (type is automatically set to 'success')
   * @returns The unique ID of the created toast
   *
   * @example
   * ```ts
   * toastService.success('Changes saved!', { icon: '✓' });
   * ```
   */
  success(message: string, options: Omit<ToastOptions, 'type'> = {}): string {
    return this.show(message, { ...options, type: 'success' });
  }

  /**
   * Display an error toast notification.
   *
   * @param message - The error message to display
   * @param options - Configuration options (type is automatically set to 'error')
   * @returns The unique ID of the created toast
   *
   * @example
   * ```ts
   * toastService.error('Failed to save changes', { icon: '✕' });
   * ```
   */
  error(message: string, options: Omit<ToastOptions, 'type'> = {}): string {
    return this.show(message, { ...options, type: 'error' });
  }

  /**
   * Display a warning toast notification.
   *
   * @param message - The warning message to display
   * @param options - Configuration options (type is automatically set to 'warning')
   * @returns The unique ID of the created toast
   *
   * @example
   * ```ts
   * toastService.warning('This action cannot be undone', { icon: '⚠' });
   * ```
   */
  warning(message: string, options: Omit<ToastOptions, 'type'> = {}): string {
    return this.show(message, { ...options, type: 'warning' });
  }

  /**
   * Display an info toast notification.
   *
   * @param message - The informational message to display
   * @param options - Configuration options (type is automatically set to 'info')
   * @returns The unique ID of the created toast
   *
   * @example
   * ```ts
   * toastService.info('New update available', { icon: 'ℹ' });
   * ```
   */
  info(message: string, options: Omit<ToastOptions, 'type'> = {}): string {
    return this.show(message, { ...options, type: 'info' });
  }

  /**
   * Dismiss a specific toast notification by its ID.
   *
   * @param id - The unique ID of the toast to dismiss
   *
   * @example
   * ```ts
   * const toastId = toastService.info('Processing...');
   * // Later...
   * toastService.dismiss(toastId);
   * ```
   */
  dismiss(id: string): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  /**
   * Dismiss all active toast notifications.
   *
   * @example
   * ```ts
   * toastService.dismissAll();
   * ```
   */
  dismissAll(): void {
    this.toasts.set([]);
  }
}
