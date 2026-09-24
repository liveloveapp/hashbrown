'use client';

import { useSyncExternalStore } from 'react';

/** A notification shown by {@link HomeToasts}. */
export interface HomeToast {
  id: string;
  message: string;
}

/**
 * Append a toast, returning a new list.
 *
 * @param toasts - The current toasts.
 * @param toast - The toast to add.
 */
export function addToast(
  toasts: readonly HomeToast[],
  toast: HomeToast,
): HomeToast[] {
  return [...toasts, toast];
}

/**
 * Remove a toast by id, returning a new list.
 *
 * @param toasts - The current toasts.
 * @param id - The id of the toast to remove.
 */
export function removeToast(
  toasts: readonly HomeToast[],
  id: string,
): HomeToast[] {
  return toasts.filter((toast) => toast.id !== id);
}

/** How long a toast stays up, matching the Angular `ToastService` default. */
const DURATION_MS = 5000;

const EMPTY: HomeToast[] = [];
let current: HomeToast[] = EMPTY;
let nextId = 0;
const listeners = new Set<() => void>();

function publish(next: HomeToast[]): void {
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Dismiss a toast.
 *
 * @param id - The id returned by {@link showSuccessToast}.
 */
export function dismissToast(id: string): void {
  publish(removeToast(current, id));
}

/**
 * Show a success toast at the top center for five seconds, like the Angular
 * site's `toast.success(message, { position: 'top-center' })`.
 *
 * @param message - The text to show.
 * @returns The toast's id.
 */
export function showSuccessToast(message: string): string {
  const id = `toast-${++nextId}`;
  publish(addToast(current, { id, message }));
  setTimeout(() => dismissToast(id), DURATION_MS);
  return id;
}

/** The active toasts; always empty on the server. */
export function useToasts(): readonly HomeToast[] {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => EMPTY,
  );
}
