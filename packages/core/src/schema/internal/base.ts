/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CleanInterfaceShape,
  Flatten,
  IsUnion,
  UnionToTuple,
} from '../../utils/types';
import { isStreaming } from './isStreaming';

export const internal = '~schema';
export type internal = typeof internal;

export const DISCRIMINATOR = '__discriminator';

type TypeInternals = {
  definition: {
    description: string;
    streaming: boolean;
  };
};

type TypeBox = {
  [internal]: TypeInternals;
};

export interface HashbrownTypeCtor<
  T extends TypeBox,
  D = T[internal]['definition'],
> {
  new (def: D): T;
  init(inst: T, def: D): asserts inst is T;
}

export const HashbrownTypeCtor = <
  T extends TypeBox,
  D extends TypeInternals['definition'] = T[internal]['definition'],
>(
  name: string,
  initializer: (instance: T, definition: D) => void,
): HashbrownTypeCtor<T, D> => {
  class Class {
    constructor(definition: D) {
      Class.init(this as any, definition);
    }

    static init(instance: T, definition: D) {
      instance[internal] ??= {
        definition: {
          description: '',
          streaming: false,
        },
      } as any;

      initializer(instance, definition);

      instance[internal].definition = definition;
    }
  }

  Object.defineProperty(Class, 'name', { value: name });

  return Class as HashbrownTypeCtor<T, D>;
};

interface HashbrownTypeDefinition {
  type:
    | 'string'
    | 'const-string'
    | 'number'
    | 'boolean'
    | 'integer'
    | 'object'
    | 'array'
    | 'enum'
    | 'any-of'
    | 'null';
  description: string;
  streaming: boolean;
}
export interface HashbrownType<out Result = unknown> {
  [internal]: HashbrownTypeInternals<Result>;
}

interface HashbrownTypeInternals<out Result = unknown>
  extends HashbrownType<Result> {
  definition: HashbrownTypeDefinition;
  result: Result;
}

export const HashbrownType: HashbrownTypeCtor<HashbrownType> =
  HashbrownTypeCtor('HashbrownType', (inst, def) => {
    inst ??= {} as any;
    inst[internal].definition = def;
  });

/**
 * --------------------------------------
 * --------------------------------------
 *             String Type
 * --------------------------------------
 * --------------------------------------
 */

interface StringTypeDefinition extends HashbrownTypeDefinition {
  type: 'string';
}

interface StringTypeInternals extends HashbrownTypeInternals<string> {
  definition: StringTypeDefinition;
}

export interface StringType extends HashbrownType<string> {
  [internal]: StringTypeInternals;
}

export const StringType: HashbrownTypeCtor<StringType> = HashbrownTypeCtor(
  'String',
  (inst, def) => {
    HashbrownType.init(inst, def);
  },
);

export function isStringType(type: HashbrownType): type is StringType {
  return type[internal].definition.type === 'string';
}

export function string(description: string): StringType {
  return new StringType({ type: 'string', description, streaming: false });
}

/**
 * --------------------------------------
 * --------------------------------------
 *          Const String Type
 * --------------------------------------
 * --------------------------------------
 */

interface ConstStringTypeDefinition<T extends string = string>
  extends HashbrownTypeDefinition {
  type: 'const-string';
  value: T;
}

interface ConstStringTypeInternals<T extends string = string>
  extends HashbrownTypeInternals<T> {
  definition: ConstStringTypeDefinition<T>;
}

export interface ConstStringType<T extends string = string>
  extends HashbrownType<T> {
  [internal]: ConstStringTypeInternals<T>;
}

export const ConstStringType: HashbrownTypeCtor<ConstStringType> =
  HashbrownTypeCtor('ConstString', (inst, def) => {
    HashbrownType.init(inst, def);
  });

export function isConstStringType(
  type: HashbrownType,
): type is ConstStringType {
  return type[internal].definition.type === 'const-string';
}

export function constString<T extends string>(value: T): ConstStringType<T> {
  return new ConstStringType({
    type: 'const-string',
    description: `${value}`,
    value,
    streaming: false,
  }) as any;
}
/**
 * --------------------------------------
 * --------------------------------------
 *             Number Type
 * --------------------------------------
 * --------------------------------------
 */

interface NumberTypeDefinition extends HashbrownTypeDefinition {
  type: 'number';
}

interface NumberTypeInternals extends HashbrownTypeInternals<number> {
  definition: NumberTypeDefinition;
}

export interface NumberType extends HashbrownType<number> {
  [internal]: NumberTypeInternals;
}

export const NumberType: HashbrownTypeCtor<NumberType> = HashbrownTypeCtor(
  'Number',
  (inst, def) => {
    HashbrownType.init(inst, def);
  },
);

export function isNumberType(type: HashbrownType): type is NumberType {
  return type[internal].definition.type === 'number';
}

export function number(description: string) {
  return new NumberType({ type: 'number', description, streaming: false });
}

/**
 * --------------------------------------
 * --------------------------------------
 *             Boolean Type
 * --------------------------------------
 * --------------------------------------
 */

interface BooleanTypeDefinition extends HashbrownTypeDefinition {
  type: 'boolean';
}

interface BooleanTypeInternals extends HashbrownTypeInternals<boolean> {
  definition: BooleanTypeDefinition;
}

export interface BooleanType extends HashbrownType<boolean> {
  [internal]: BooleanTypeInternals;
}

export const BooleanType: HashbrownTypeCtor<BooleanType> = HashbrownTypeCtor(
  'Boolean',
  (inst, def) => {
    HashbrownType.init(inst, def);
  },
);

export function isBooleanType(type: HashbrownType): type is BooleanType {
  return type[internal].definition.type === 'boolean';
}

export function boolean(description: string) {
  return new BooleanType({ type: 'boolean', description, streaming: false });
}

/**
 * --------------------------------------
 * --------------------------------------
 *             Integer Type
 * --------------------------------------
 * --------------------------------------
 */

interface IntegerTypeDefinition extends HashbrownTypeDefinition {
  type: 'integer';
}

interface IntegerTypeInternals extends HashbrownTypeInternals<number> {
  definition: IntegerTypeDefinition;
}

export interface IntegerType extends HashbrownType<number> {
  [internal]: IntegerTypeInternals;
}

export const IntegerType: HashbrownTypeCtor<IntegerType> = HashbrownTypeCtor(
  'Integer',
  (inst, def) => {
    HashbrownType.init(inst, def);
  },
);

export function isIntegerType(type: HashbrownType): type is IntegerType {
  return type[internal].definition.type === 'integer';
}

export function integer(description: string) {
  return new IntegerType({ type: 'integer', description, streaming: false });
}

/**
 * --------------------------------------
 * --------------------------------------
 *             Object Type
 * --------------------------------------
 * --------------------------------------
 */

type ObjectTypeResult<T extends Record<string, any>> = string extends keyof T
  ? object
  : {} extends T
    ? object
    : Flatten<{
        -readonly [K in keyof T]: T[K][internal]['result'];
      }>;

interface ObjectTypeDefinition<
  out Shape extends Record<string, any> = Record<string, any>,
> extends HashbrownTypeDefinition {
  type: 'object';
  readonly shape: Shape;
}

interface ObjectTypeInternals<Result extends Readonly<Record<string, any>>>
  extends HashbrownTypeInternals<ObjectTypeResult<Result>> {
  definition: ObjectTypeDefinition<Result>;
}

export interface ObjectType<
  Result extends Readonly<Record<string, any>> = Readonly<Record<string, any>>,
> extends HashbrownType {
  [internal]: ObjectTypeInternals<Result>;
}

export const ObjectType: HashbrownTypeCtor<ObjectType> = HashbrownTypeCtor(
  'Object',
  (inst, def) => {
    HashbrownType.init(inst, def);
  },
);

export function isObjectType(type: HashbrownType): type is ObjectType {
  return type[internal].definition.type === 'object';
}

export function object<Shape extends Record<string, any>>(
  description: string,
  shape: Shape,
): ObjectType<CleanInterfaceShape<Shape>> {
  // Sort streaming properties to the end so that non-streaming objects with
  // streaming properties can have the non-streaming properties populated when
  // they are all completed
  const shapeWithStreamingAtEnd = Object.entries(shape)
    .sort((a, b) => {
      if (!isStreaming(a[1]) && isStreaming(b[1])) {
        return -1;
      }
      if (isStreaming(a[1]) && !isStreaming(b[1])) {
        return 1;
      }

      return 0;
    })
    .reduce(
      (acc, curr) => {
        acc[curr[0]] = curr[1];

        return acc;
      },
      {} as Record<string, any>,
    );

  return new ObjectType({
    type: 'object',
    description,
    streaming: false,
    shape: shapeWithStreamingAtEnd,
  }) as any;
}

/**
 * --------------------------------------
 * --------------------------------------
 *             Array Type
 * --------------------------------------
 * --------------------------------------
 */

interface ArrayTypeDefinition<out Item extends HashbrownType = HashbrownType>
  extends HashbrownTypeDefinition {
  type: 'array';
  element: Item;
}

interface ArrayTypeInternals<Item extends HashbrownType = HashbrownType>
  extends HashbrownTypeInternals<Item[internal]['result'][]> {
  definition: ArrayTypeDefinition<Item>;
}

export interface ArrayType<Item extends HashbrownType = HashbrownType>
  extends HashbrownType {
  [internal]: ArrayTypeInternals<Item>;
}

export const ArrayType: HashbrownTypeCtor<ArrayType> = HashbrownTypeCtor(
  'Array',
  (inst, def) => {
    HashbrownType.init(inst, def);
  },
);

export function isArrayType(type: HashbrownType): type is ArrayType {
  return type[internal].definition.type === 'array';
}

export function array<Item extends HashbrownType>(
  description: string,
  item: Item,
): ArrayType<Item> {
  return new ArrayType({
    type: 'array',
    description,
    streaming: false,
    element: item,
  }) as any;
}

/**
 * --------------------------------------
 * --------------------------------------
 *             Any-Of Type
 * --------------------------------------
 * --------------------------------------
 */

interface AnyOfTypeDefinition<
  Options extends readonly HashbrownType[] = readonly HashbrownType[],
> extends HashbrownTypeDefinition {
  type: 'any-of';
  options: Options;
}

interface AnyOfTypeInternals<Options extends readonly HashbrownType[]>
  extends HashbrownTypeInternals<Options[number][internal]['result']> {
  definition: AnyOfTypeDefinition<Options>;
}

export interface AnyOfType<
  Options extends readonly HashbrownType[] = readonly HashbrownType[],
> extends HashbrownType<Options[number][internal]['result']> {
  [internal]: AnyOfTypeInternals<Options>;
}

export const AnyOfType: HashbrownTypeCtor<AnyOfType> = HashbrownTypeCtor(
  'AnyOfType',
  (inst, def) => {
    HashbrownType.init(inst, def);
  },
);

export function isAnyOfType(type: HashbrownType): type is AnyOfType {
  return type[internal].definition.type === 'any-of';
}

export function anyOf<const Options extends readonly HashbrownType[]>(
  description: string,
  options: Options,
): AnyOfType<Options> {
  return new AnyOfType({
    type: 'any-of',
    description,
    options,
    streaming: false,
  }) as any;
}

/**
 * --------------------------------------
 * --------------------------------------
 *             Enum Type
 * --------------------------------------
 * --------------------------------------
 */

interface EnumTypeDefinition<out Entries extends string[]>
  extends HashbrownTypeDefinition {
  type: 'enum';
  entries: Entries;
}

interface EnumTypeInternals<out Entries extends string[]>
  extends HashbrownTypeInternals<Entries> {
  definition: EnumTypeDefinition<Entries>;
}

export interface EnumType<out Entries extends string[] = string[]>
  extends HashbrownType<Entries> {
  [internal]: EnumTypeInternals<Entries>;
}

export const EnumType: HashbrownTypeCtor<EnumType> = HashbrownTypeCtor(
  'Enum',
  (inst, def) => {
    HashbrownType.init(inst, def);
  },
);

export function isEnumType(type: HashbrownType): type is EnumType {
  return type[internal].definition.type === 'enum';
}

export function enumType<Entries extends string[]>(
  description: string,
  entries: Entries,
) {
  return new EnumType({ type: 'enum', description, entries, streaming: false });
}

/**
 * --------------------------------------
 * --------------------------------------
 *             Null Type
 * --------------------------------------
 * --------------------------------------
 */

interface NullTypeDefinition extends HashbrownTypeDefinition {
  type: 'null';
}

interface NullTypeInternals extends HashbrownTypeInternals<null> {
  definition: NullTypeDefinition;
}

export interface NullType extends HashbrownType<null> {
  [internal]: NullTypeInternals;
}

export const NullType: HashbrownTypeCtor<NullType> = HashbrownTypeCtor(
  'Null',
  (inst, def) => {
    HashbrownType.init(inst, def);
  },
);

export function isNullType(type: HashbrownType): type is NullType {
  return type[internal].definition.type === 'null';
}

export function nullType(): NullType {
  return new NullType({ type: 'null', description: '', streaming: false });
}

/**
 * --------------------------------------
 * --------------------------------------
 *             Type Utilities
 * --------------------------------------
 * --------------------------------------
 */

export type Infer<T extends HashbrownType> = T[internal]['result'];

type SchemaForUnion<T> = AnyOfType<
  UnionToTuple<T> extends infer U
    ? U extends any[]
      ? { [K in keyof U]: Schema<U[K]> }
      : never
    : never
>;

export type Schema<T> =
  IsUnion<T> extends true
    ? SchemaForUnion<T>
    : T extends string[]
      ? EnumType<T>
      : T extends Array<infer U>
        ? ArrayType<Schema<U>>
        : T extends string
          ? string extends T
            ? StringType
            : ConstStringType<T>
          : T extends number
            ? NumberType | IntegerType
            : T extends boolean
              ? BooleanType
              : T extends null
                ? NullType
                : T extends object
                  ? ObjectType<{ [K in keyof T]: Schema<T[K]> }>
                  : never;
