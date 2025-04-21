/**
 * A utility type that takes a type `T` and returns a new type
 * with the same properties as `T`. This type is primarily used
 * to improve the readability of complex type definitions by
 * expanding them into a more human-readable form.
 *
 * @template T - The type to be prettified.
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
