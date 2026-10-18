import type { s } from '../schema';
import type { internal } from '../schema/constants';

/**
 * An object schema whose shape values are all decidable.
 *
 * Expressed structurally over the schema's definition because `ObjectType`
 * is invariant in its shape parameter.
 */
type DecidableObject = s.ObjectType<any> & {
  [internal]: {
    definition: { shape: Readonly<Record<string, DecidableSchema>> };
  };
};

/**
 * A Skillet schema that a decision model can answer: enumerations, booleans,
 * numbers, integers, and objects whose values are themselves decidable.
 *
 * @public
 */
export type DecidableSchema =
  | s.EnumType<any>
  | s.BooleanType
  | s.NumberType
  | s.IntegerType
  | DecidableObject;
