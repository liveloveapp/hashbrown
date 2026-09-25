'use client';

import { useSyncExternalStore } from 'react';

/** The kind of a toast, which sets its colors and live-region politeness. */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Where on screen a toast appears. */
export type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * A toast notification, ported from `www/analog/src/app/models/toast.models.ts`.
 */
export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  position?: ToastPosition;
  dismissible?: boolean;
  icon?: string;
}

/** Options for {@link toastService}'s `show` and typed helpers. */
export interface ToastOptions {
  type?: ToastType;
  duration?: number;
  position?: ToastPosition;
  dismissible?: boolean;
  icon?: string;
}

/**
 * Build a toast, filling in the Angular `ToastService` defaults: an info toast
 * at the top right that can be dismissed and closes after five seconds.
 *
 * @param id - The toast's id.
 * @param message - The text to show.
 * @param options - Overrides for the defaults.
 * @returns The toast.
 */
export function createToast(
  id: string,
  message: string,
  options: ToastOptions = {},
): Toast {
  return {
    id,
    message,
    type: options.type ?? 'info',
    duration: options.duration ?? 5000,
    position: options.position ?? 'top-right',
    dismissible: options.dismissible ?? true,
    icon: options.icon,
  };
}

const EMPTY: readonly Toast[] = [];
let current: readonly Toast[] = EMPTY;
let nextId = 0;
const listeners = new Set<() => void>();

function publish(next: readonly Toast[]): void {
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The active toasts, oldest first. */
export function getToasts(): readonly Toast[] {
  return current;
}

const getServerToasts = () => EMPTY;

function show(message: string, options: ToastOptions = {}): string {
  const id = `toast-${++nextId}-${Date.now()}`;
  const toast = createToast(id, message, options);
  publish([...current, toast]);
  if (toast.duration && toast.duration > 0) {
    setTimeout(() => dismiss(id), toast.duration);
  }
  return id;
}

function dismiss(id: string): void {
  if (current.some((toast) => toast.id === id)) {
    publish(current.filter((toast) => toast.id !== id));
  }
}

/**
 * The site's toast notifications, a port of the Angular `ToastService`.
 * Toasts show in the `ToastContainer` mounted by the root layout.
 *
 * @example
 * ```ts
 * toastService.success('Code copied to clipboard', { position: 'top-center' });
 * ```
 */
export const toastService = {
  /**
   * Show a toast.
   *
   * @param message - The text to show.
   * @param options - Type, position, duration (0 keeps it up), and so on.
   * @returns The toast's id, for {@link toastService.dismiss}.
   */
  show,
  /** Show a success toast. Takes the same arguments as `show`, minus `type`. */
  success: (message: string, options: Omit<ToastOptions, 'type'> = {}) =>
    show(message, { ...options, type: 'success' }),
  /** Show an error toast. Takes the same arguments as `show`, minus `type`. */
  error: (message: string, options: Omit<ToastOptions, 'type'> = {}) =>
    show(message, { ...options, type: 'error' }),
  /** Show a warning toast. Takes the same arguments as `show`, minus `type`. */
  warning: (message: string, options: Omit<ToastOptions, 'type'> = {}) =>
    show(message, { ...options, type: 'warning' }),
  /** Show an info toast. Takes the same arguments as `show`, minus `type`. */
  info: (message: string, options: Omit<ToastOptions, 'type'> = {}) =>
    show(message, { ...options, type: 'info' }),
  /**
   * Dismiss a toast.
   *
   * @param id - The id `show` returned.
   */
  dismiss,
  /** Dismiss every toast. */
  dismissAll: (): void => publish(EMPTY),
};

/** The active toasts; always empty on the server and during hydration. */
export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribe, getToasts, getServerToasts);
}
