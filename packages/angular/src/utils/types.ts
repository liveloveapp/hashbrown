import { Signal } from '@angular/core';

/**
 * A type that represents a signal or a value.
 *
 * @public
 * @typeParam T - The type of the signal or value.
 */
export type SignalLike<T> = T | Signal<T>;
