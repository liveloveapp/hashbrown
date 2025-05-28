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

/**
 * A utility type that returns the type it receives as input.
 * This type is often used to force TypeScript to evaluate
 * and simplify complex types, making them easier to read
 * and understand.
 *
 * @template T - The type to be returned as is.
 */
export type Identity<T> = T;

/**
 * A utility type that flattens a given type `T` by mapping over its keys
 * and returning a new type with the same properties. This type is useful
 * for simplifying complex type structures, making them easier to read
 * and understand.
 *
 * @template T - The type to be flattened.
 */
export type Flatten<T> = Identity<{ [k in keyof T]: T[k] }>;

/**
 * This is a mysterious little helper found in the Zod codebase.
 * If you read the implementation, you'd think that it is stripping
 * question marks from the keys of an object. While that's technically
 * true, we never use it to actually strip question marks.
 *
 * Instead, it works a lot like `Prettify`. In our schema library, we
 * support cycles using getters:
 *
 * ```ts
 * const node = s.object({
 *   tagName: s.string(),
 *   get children() {
 *     return s.array('children', node);
 *   }
 * })
 * ```
 *
 * However, once we use `s.Infer` on this, for some reason, the
 * TypeScript language service doesn't print the correct type for
 * the `children` property. Strangely, it's just a printing error,
 * the type is actually correct.
 *
 * This helper cleans the type so that it prints correctly.
 */
export type CleanInterfaceShape<T extends object> = Identity<{
  [k in keyof T as k extends `${infer K}?`
    ? K
    : k extends `?${infer K}`
      ? K
      : k]: T[k];
}>;

/**
 * A utility type that checks if a type `T` is a union.
 * This type is useful for determining if a type is a union
 * and for converting a union to an intersection.
 *
 * @template T - The type to be checked.
 */
export type IsUnion<T, U = T> = T extends any
  ? [U] extends [T]
    ? false
    : true
  : never;

export type IsStringUnion<T> =
  IsUnion<T> extends true ? (T extends string ? true : false) : false;

/**
 * A utility type that converts a union type `U` to an intersection type.
 * This type is useful for converting a union to an intersection,
 * which can be useful for various type operations.
 *
 * @template U - The union type to be converted.
 */
export type UnionToIntersection<U> = (
  U extends any ? (x: U) => any : never
) extends (x: infer I) => any
  ? I
  : never;

/**
 * A utility type that returns the last element of a union type.
 * This type is useful for extracting the last element from a union,
 * which can be useful for various type operations.
 *
 * @template T - The union type to be processed.
 */
export type LastOf<T> =
  UnionToIntersection<T extends any ? (x: T) => any : never> extends (
    x: infer L,
  ) => any
    ? L
    : never;

/**
 * A utility type that converts a union type `T` to a tuple.
 * This type is useful for converting a union to a tuple,
 * which can be useful for various type operations.
 *
 * @template T - The union type to be converted.
 */
export type UnionToTuple<T, L = LastOf<T>> = [T] extends [never]
  ? []
  : [...UnionToTuple<Exclude<T, L>>, L];

/**
 * A utility type that makes all properties of a type `T` optional.
 * This type is useful for creating partial types, which can be
 * useful for various type operations.
 *
 * @template T - The type to be made partial.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
