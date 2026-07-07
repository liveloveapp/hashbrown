import { Signal } from '@angular/core';

/**
 * A value that can be supplied directly or through an Angular signal.
 *
 * @public
 * @typeParam T - The option value type.
 */
export type ReactiveOption<T> = T | Signal<T>;

/**
 * A type that represents a signal or a value.
 *
 * @public
 * @typeParam T - The type of the signal or value.
 */
export type SignalLike<T> = T | Signal<T>;
