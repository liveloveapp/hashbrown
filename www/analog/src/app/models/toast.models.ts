export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  position?: ToastPosition;
  dismissible?: boolean;
  icon?: string;
}

export interface ToastOptions {
  type?: ToastType;
  duration?: number;
  position?: ToastPosition;
  dismissible?: boolean;
  icon?: string;
}
