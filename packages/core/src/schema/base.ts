/**
 * Skillet is an LLM-optimized streaming JSON Parser - perfectly suited for streaming hot and fresh JSON.
 *
 * Portions of this code are derived from Zod (MIT License) (https://github.com/colinhacks/zod).
 * See the LICENSE file in the project root for full license text.
 *
 * @license MIT
 * @author LiveLoveApp, LLC
 * @see https://github.com/liveloveapp/hashbrown
 * @see https://github.com/colinhacks/zod
 */

/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  CleanInterfaceShape,
  Flatten,
  IsStringUnion,
  IsUnion,
  UnionToTuple,
} from '../utils/types';

/**
 * @internal
 */
export const internal = '~schema';
export type internal = typeof internal;

export const PRIMITIVE_WRAPPER_FIELD_NAME = '__wrappedPrimitive';

type TypeInternals = {
  definition: {
    description: string;
    streaming: boolean;
  };
};

type TypeBox = {
  [internal]: TypeInternals;
  toJsonSchema: () => object;
  parseJsonSchema: (object: unknown, path: string[]) => any;
  toTypeScript: (pathSeen?: Set<HashbrownType>) => string;
};

/**
 * @internal
 */
export interface HashbrownTypeCtor<
  T extends TypeBox,
  D = T[internal]['definition'],
> {
  new (def: D): T;
  init(inst: T, def: D): asserts inst is T;
  toJsonSchema(schema: any): any;
  parseJsonSchema(object: unknown, path: string[]): any;
  toTypeScript: (pathSeen?: Set<HashbrownType>) => string;
}

/**
 * @internal
 */
export const HashbrownTypeCtor = <
  T extends TypeBox,
  D extends TypeInternals['definition'] = T[internal]['definition'],
>({
  name,
  initializer,
  toJsonSchemaImpl,
  parseJsonSchemaImpl,
  toTypeScriptImpl,
  validateImpl,
  toStreamingImpl,
}: {
  name: string;
  initializer: (instance: T, definition: D) => void;
  toJsonSchemaImpl: (schema: HashbrownTypeCtor<T, D>) => any;
  parseJsonSchemaImpl: (
    schema: HashbrownTypeCtor<T, D>,
    object: unknown,
    path: string[],
  ) => any;
  toTypeScriptImpl: (
    schema: HashbrownTypeCtor<T, D>,
    pathSeen: Set<HashbrownType>,
  ) => string;
  validateImpl: (
    schema: HashbrownTypeCtor<T, D>,
    definition: D,
    object: unknown,
    path: string[],
  ) => void;
  toStreamingImpl: (
    schema: HashbrownTypeCtor<T, D>,
    definition: D,
    object: unknown,
    path: string[],
  ) => unknown;
}): HashbrownTypeCtor<T, D> => {
  class Class implements Omit<HashbrownType, internal> {
    private toJsonSchemaImpl: (schema: HashbrownTypeCtor<T, D>) => any;
    private parseJsonSchemaImpl: (
      schema: HashbrownTypeCtor<T, D>,
      object: unknown,
      path: string[],
    ) => any;
    private toTypeScriptImpl: (
      schema: HashbrownTypeCtor<T, D>,
      pathSeen: Set<HashbrownType>,
    ) => string;
    private validateImpl: (
      schema: HashbrownTypeCtor<T, D>,
      definition: D,
      object: unknown,
      path: string[],
    ) => void;
    private toStreamingImpl: (
      schema: HashbrownTypeCtor<T, D>,
      definition: D,
      object: unknown,
      path: string[],
    ) => unknown;

    constructor(definition: D) {
      Class.init(this as any, definition);
      this.toJsonSchemaImpl = toJsonSchemaImpl;
      this.parseJsonSchemaImpl = parseJsonSchemaImpl;
      this.toTypeScriptImpl = toTypeScriptImpl;
      this.validateImpl = validateImpl;
      this.toStreamingImpl = toStreamingImpl;
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

    toJsonSchema() {
      return this.toJsonSchemaImpl(this as any);
    }

    parseJsonSchema(object: unknown, path: string[] = []) {
      return this.parseJsonSchemaImpl(this as any, object, path);
    }

    toTypeScript(pathSeen: Set<HashbrownType> = new Set()) {
      return this.toTypeScriptImpl(this as any, pathSeen);
    }

    validate(object: unknown, path: string[] = []) {
      return this.validateImpl(
        this as any,
        (this as any)[internal].definition,
        object,
        path,
      );
    }

    toStreaming(object: unknown, path: string[] = []) {
      return this.toStreamingImpl(
        this as any,
        (this as any)[internal].definition,
        object,
        path,
      );
    }
  }

  Object.defineProperty(Class, 'name', { value: name });

  return Class as unknown as HashbrownTypeCtor<T, D>;
};

interface HashbrownTypeDefinition {
  type:
    | 'string'
    | 'literal'
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
/**
 * @public
 */
export interface HashbrownType<out Result = unknown> {
  [internal]: HashbrownTypeInternals<Result>;
  toJsonSchema: () => any;
  parseJsonSchema: (object: unknown, path?: string[]) => any;
  validate: (object: unknown, path?: string[]) => void;
  toTypeScript: (pathSeen?: Set<HashbrownType>) => string;
  toStreaming: (object: unknown, path?: string[]) => unknown;
}

/**
 * @internal
 */
export interface HashbrownTypeInternals<out Result = unknown>
  extends HashbrownType<Result> {
  definition: HashbrownTypeDefinition;
  result: Result;
}

export const HashbrownType: HashbrownTypeCtor<HashbrownType> =
  HashbrownTypeCtor({
    name: 'HashbrownType',
    initializer: (inst, def) => {
      inst ??= {} as any;
      inst[internal].definition = def;
    },
    toJsonSchemaImpl: () => {
      return;
    },
    parseJsonSchemaImpl: () => {
      return;
    },
    toTypeScriptImpl: () => {
      return '';
    },
    validateImpl: () => {
      return;
    },
    toStreamingImpl: () => {
      return;
    },
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

/**
 * @internal
 */
export interface StringTypeInternals extends HashbrownTypeInternals<string> {
  definition: StringTypeDefinition;
}

/**
 * @public
 */
export interface StringType extends HashbrownType<string> {
  [internal]: StringTypeInternals;
}

export const StringType: HashbrownTypeCtor<StringType> = HashbrownTypeCtor({
  name: 'String',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    return {
      type: 'string',
      description: schema[internal].definition.description,
    };
  },
  parseJsonSchemaImpl: (schema: any, object: unknown, path: string[]) => {
    // Is this a wrapped primitive?
    if (
      object != null &&
      typeof object === 'object' &&
      Object.keys(object).includes(PRIMITIVE_WRAPPER_FIELD_NAME)
    ) {
      object = (object as any)[PRIMITIVE_WRAPPER_FIELD_NAME];
    }

    if (typeof object !== 'string')
      throw new Error(`Expected a string at: ${path.join('.')}, got ${object}`);

    return object;
  },
  toTypeScriptImpl: (schema: any) => {
    return `/* ${schema[internal].definition.description} */ string`;
  },
  validateImpl: (schema: any, definition, object: unknown, path: string[]) => {
    if (typeof object !== 'string') {
      throw new Error(
        `Expected a string at: ${path.join('.')}, got ${typeof object}`,
      );
    }
    return;
  },
  toStreamingImpl: (
    schema: any,
    definition,
    object: unknown,
    path: string[],
  ) => {
    return object;
  },
});

/**
 * @public
 */
export function isStringType(type: HashbrownType): type is StringType {
  return type[internal].definition.type === 'string';
}

/**
 * @public
 */
export function string(description: string): StringType {
  return new StringType({ type: 'string', description, streaming: false });
}

/**
 * --------------------------------------
 * --------------------------------------
 *          Literal Type
 * --------------------------------------
 * --------------------------------------
 */

interface LiteralTypeDefinition<
  T extends string | number | boolean = string | number | boolean,
> extends HashbrownTypeDefinition {
  type: 'literal';
  value: T;
}

/**
 * @internal
 */
export interface LiteralTypeInternals<
  T extends string | number | boolean = string | number | boolean,
> extends HashbrownTypeInternals<T> {
  definition: LiteralTypeDefinition<T>;
}

/**
 * @public
 */
export interface LiteralType<
  T extends string | number | boolean = string | number | boolean,
> extends HashbrownType<T> {
  [internal]: LiteralTypeInternals<T>;
}

export const LiteralType: HashbrownTypeCtor<LiteralType> = HashbrownTypeCtor({
  name: 'Literal',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    const isString = typeof schema[internal].definition.value === 'string';
    const isNumber = typeof schema[internal].definition.value === 'number';
    const isBoolean = typeof schema[internal].definition.value === 'boolean';

    return {
      type: isString ? 'string' : isNumber ? 'number' : 'boolean',
      const: schema[internal].definition.value,
      description: schema[internal].definition.description,
    };
  },
  parseJsonSchemaImpl: (schema: any, object: unknown, path: string[]) => {
    // Is this a wrapped primitive?
    if (
      object != null &&
      typeof object === 'object' &&
      Object.keys(object).includes(PRIMITIVE_WRAPPER_FIELD_NAME)
    ) {
      object = (object as any)[PRIMITIVE_WRAPPER_FIELD_NAME];
    }

    const isString = typeof object === 'string';
    const isNumber = typeof object === 'number';
    const isBoolean = typeof object === 'boolean';

    if (!isString && !isNumber && !isBoolean)
      throw new Error(
        `Expected a string, number, or boolean at: ${path.join('.')}, got ${object}, received ${schema[internal].definition.value}`,
      );

    return object;
  },
  toTypeScriptImpl: (schema: any) => {
    return JSON.stringify(schema[internal].definition.value);
  },
  validateImpl: (schema, definition, object, path) => {
    if (definition.value !== object) {
      throw new Error(
        `Expected the literal value ${JSON.stringify(definition.value)} at: ${path.join('.')}, but got ${JSON.stringify(object)}`,
      );
    }
  },
  toStreamingImpl: (
    schema: any,
    definition,
    object: unknown,
    path: string[],
  ) => {
    return object;
  },
});

/**
 * @public
 */
export function isLiteralType(type: HashbrownType): type is LiteralType {
  return type[internal].definition.type === 'literal';
}

/**
 * @public
 */
export function literal<T extends string>(value: T): LiteralType<T> {
  return new LiteralType({
    type: 'literal',
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

/**
 * @internal
 */
export interface NumberTypeInternals extends HashbrownTypeInternals<number> {
  definition: NumberTypeDefinition;
}

/**
 * @public
 */
export interface NumberType extends HashbrownType<number> {
  [internal]: NumberTypeInternals;
}

export const NumberType: HashbrownTypeCtor<NumberType> = HashbrownTypeCtor({
  name: 'Number',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    return {
      type: 'number',
      description: schema[internal].definition.description,
    };
  },
  parseJsonSchemaImpl: (schema: any, object: unknown, path: string[]) => {
    // Is this a wrapped primitive?
    if (
      object != null &&
      typeof object === 'object' &&
      Object.keys(object).includes(PRIMITIVE_WRAPPER_FIELD_NAME)
    ) {
      object = (object as any)[PRIMITIVE_WRAPPER_FIELD_NAME];
    }

    if (typeof object !== 'number')
      throw new Error(`Expected a number at: ${path.join('.')}`);

    return object;
  },
  toTypeScriptImpl: (schema: any) => {
    return `/* ${schema[internal].definition.description} */ number`;
  },
  validateImpl: (schema, definition, object, path) => {
    if (typeof object !== 'number') {
      throw new Error(`Expected a number at: ${path.join('.')}`);
    }
  },
  toStreamingImpl: (
    schema: any,
    definition,
    object: unknown,
    path: string[],
  ) => {
    return object;
  },
});

/**
 * @public
 */
export function isNumberType(type: HashbrownType): type is NumberType {
  return type[internal].definition.type === 'number';
}

/**
 * @public
 */
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

/**
 * @internal
 */
export interface BooleanTypeInternals extends HashbrownTypeInternals<boolean> {
  definition: BooleanTypeDefinition;
}

/**
 * @public
 */
export interface BooleanType extends HashbrownType<boolean> {
  [internal]: BooleanTypeInternals;
}

export const BooleanType: HashbrownTypeCtor<BooleanType> = HashbrownTypeCtor({
  name: 'Boolean',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    return {
      type: 'boolean',
      description: schema[internal].definition.description,
    };
  },
  parseJsonSchemaImpl: (schema: any, object: unknown, path: string[]) => {
    // Is this a wrapped primitive?
    if (
      object != null &&
      typeof object === 'object' &&
      Object.keys(object).includes(PRIMITIVE_WRAPPER_FIELD_NAME)
    ) {
      object = (object as any)[PRIMITIVE_WRAPPER_FIELD_NAME];
    }

    if (typeof object !== 'boolean')
      throw new Error(`Expected a boolean at: ${path.join('.')}`);

    return object;
  },
  toTypeScriptImpl: (schema: any) => {
    return `/* ${schema[internal].definition.description} */ boolean`;
  },
  validateImpl: (schema, definition, object, path) => {
    if (typeof object !== 'boolean')
      throw new Error(`Expected a boolean at: ${path.join('.')}`);
  },
  toStreamingImpl: (
    schema: any,
    definition,
    object: unknown,
    path: string[],
  ) => {
    return object;
  },
});

/**
 * @public
 */
export function isBooleanType(type: HashbrownType): type is BooleanType {
  return type[internal].definition.type === 'boolean';
}

/**
 * @public
 */
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

/**
 * @internal
 */
export interface IntegerTypeInternals extends HashbrownTypeInternals<number> {
  definition: IntegerTypeDefinition;
}

/**
 * @public
 */
export interface IntegerType extends HashbrownType<number> {
  [internal]: IntegerTypeInternals;
}

export const IntegerType: HashbrownTypeCtor<IntegerType> = HashbrownTypeCtor({
  name: 'Integer',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    return {
      type: 'integer',
      description: schema[internal].definition.description,
    };
  },
  parseJsonSchemaImpl: (schema: any, object: unknown, path: string[]) => {
    // Is this a wrapped primitive?
    if (
      object != null &&
      typeof object === 'object' &&
      Object.keys(object).includes(PRIMITIVE_WRAPPER_FIELD_NAME)
    ) {
      object = (object as any)[PRIMITIVE_WRAPPER_FIELD_NAME];
    }

    if (typeof object !== 'number')
      throw new Error(`Expected a number at: ${path.join('.')}`);
    if (!Number.isInteger(object))
      throw new Error(`Expected an integer at: ${path.join('.')}`);

    return object;
  },
  toTypeScriptImpl: (schema: any) => {
    return `/* ${schema[internal].definition.description} */ integer`;
  },
  validateImpl: (schema, definition, object, path) => {
    if (typeof object !== 'number')
      throw new Error(`Expected a number at: ${path.join('.')}`);
    if (!Number.isInteger(object))
      throw new Error(`Expected an integer at: ${path.join('.')}`);
  },
  toStreamingImpl: (
    schema: any,
    definition,
    object: unknown,
    path: string[],
  ) => {
    return object;
  },
});

/**
 * @public
 */
export function isIntegerType(type: HashbrownType): type is IntegerType {
  return type[internal].definition.type === 'integer';
}

/**
 * @public
 */
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

/**
 * @internal
 */
export interface ObjectTypeInternals<
  Result extends Readonly<Record<string, any>>,
> extends HashbrownTypeInternals<ObjectTypeResult<Result>> {
  definition: ObjectTypeDefinition<Result>;
}

/**
 * @public
 */
export interface ObjectType<
  Result extends Readonly<Record<string, any>> = Readonly<Record<string, any>>,
> extends HashbrownType {
  [internal]: ObjectTypeInternals<Result>;
}

export const ObjectType: HashbrownTypeCtor<ObjectType> = HashbrownTypeCtor({
  name: 'Object',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    return {
      type: 'object',
      // Properties is populated externally because we need to find loops
      properties: {},
      required: Object.keys(schema[internal].definition.shape),
      additionalProperties: false,
      description: schema[internal].definition.description,
    };
  },
  parseJsonSchemaImpl: (schema: any, object: unknown, path: string[]) => {
    if (typeof object !== 'object' || object === null)
      throw new Error(`Expected an object at: ${path.join('.')}`);

    const { shape } = schema[internal].definition;

    Object.entries(shape).forEach(([key, child]) => {
      // AnyOf unwrapping can change the desired form of the result object, so
      // update the object as we parse
      (object as any)[key as keyof typeof object] = (
        child as any
      ).parseJsonSchema(object[key as keyof typeof object], [...path, key]);
    });

    return object;
  },
  toTypeScriptImpl: (schema: any, pathSeen: Set<HashbrownType>) => {
    if (pathSeen.has(schema)) {
      const desc = schema[internal].definition.description || '<anonymous>';
      throw new Error(`Cycle detected in schema at "${desc}"`);
    }
    pathSeen.add(schema);

    const depth = pathSeen.size - 1;

    const entries = Object.entries(schema[internal].definition.shape);
    const lines = entries.map(([key, child]) => {
      // clone pathSeen for each branch
      return `${' '.repeat(depth + 2)}${key}: ${(child as any).toTypeScript(new Set(pathSeen))};`;
    });

    return `/* ${schema[internal].definition.description} */ {
${lines.join('\n')}
${' '.repeat(depth)}}`;
  },
  validateImpl: (schema, definition, object, path) => {
    if (typeof object !== 'object' || object === null)
      throw new Error(`Expected an object at: ${path.join('.')}`);

    const { shape } = definition;

    Object.entries<HashbrownType>(shape).forEach(([key, child]) => {
      child.validate(object[key as keyof typeof object], [...path, key]);
    });

    return object;
  },
  toStreamingImpl: (
    schema: any,
    definition,
    object: unknown,
    path: string[],
  ) => {
    const { shape } = definition;
    const entries = Object.entries<HashbrownType>(shape);
    return Object.fromEntries(
      entries.map(([key, value]) => {
        return [
          key,
          value.toStreaming((object as object)[key as keyof typeof object], [
            ...path,
            key,
          ]),
        ];
      }),
    );
  },
});

/**
 * @public
 */
export function isObjectType(type: HashbrownType): type is ObjectType {
  return type[internal].definition.type === 'object';
}

/**
 * @public
 */
export function object<Shape extends Record<string, any>>(
  description: string,
  shape: Shape,
): ObjectType<CleanInterfaceShape<Shape>> {
  return new ObjectType({
    type: 'object',
    description,
    streaming: false,
    shape,
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

/**
 * @internal
 */
export interface ArrayTypeInternals<Item extends HashbrownType = HashbrownType>
  extends HashbrownTypeInternals<Item[internal]['result'][]> {
  definition: ArrayTypeDefinition<Item>;
}

/**
 * @public
 */
export interface ArrayType<Item extends HashbrownType = HashbrownType>
  extends HashbrownType {
  [internal]: ArrayTypeInternals<Item>;
}

export const ArrayType: HashbrownTypeCtor<ArrayType> = HashbrownTypeCtor({
  name: 'Array',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    return {
      type: 'array',
      // items is populated externally since we find loops and duplicated sections
      // through the whole schema
      items: [],
      description: schema[internal].definition.description,
    };
  },
  parseJsonSchemaImpl: (schema: any, object: unknown, path: string[]) => {
    // Is this a wrapped primitive?
    if (
      object != null &&
      typeof object === 'object' &&
      Object.keys(object).includes(PRIMITIVE_WRAPPER_FIELD_NAME)
    ) {
      object = (object as any)[PRIMITIVE_WRAPPER_FIELD_NAME];
    }

    if (!Array.isArray(object))
      throw new Error(`Expected an array at: ${path.join('.')}`);

    // AnyOf unwrapping can change the desired form of the result object, so
    // update the object as we parse
    object.forEach((item) => {
      item = schema[internal].definition.element.parseJsonSchema(item, path);
    });

    return object;
  },
  toTypeScriptImpl: (schema: any, pathSeen: Set<HashbrownType>) => {
    if (pathSeen.has(schema)) {
      const desc = schema[internal].definition.description || '<anonymous>';
      throw new Error(`Cycle detected in schema at "${desc}"`);
    }
    pathSeen.add(schema);

    return `/* ${schema[internal].definition.description} */ Array<${schema[
      internal
    ].definition.element.toTypeScript(new Set(pathSeen))}>`;
  },
  validateImpl: (schema, definition, object, path) => {
    if (!Array.isArray(object))
      throw new Error(`Expected an array at: ${path.join('.')}`);

    object.forEach((item) => {
      definition.element.validate(item, path);
    });
  },
  toStreamingImpl: (
    schema: any,
    definition,
    object: unknown,
    path: string[],
  ) => {
    return (object as any[]).map((item) => {
      return definition.element.toStreaming(item, path);
    });
  },
});

/**
 * @public
 */
export function isArrayType(type: HashbrownType): type is ArrayType {
  return type[internal].definition.type === 'array';
}

/**
 * @public
 */
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

/**
 * @internal
 */
export interface AnyOfTypeInternals<Options extends readonly HashbrownType[]>
  extends HashbrownTypeInternals<Options[number][internal]['result']> {
  definition: AnyOfTypeDefinition<Options>;
}

/**
 * @public
 */
export interface AnyOfType<
  Options extends readonly HashbrownType[] = readonly HashbrownType[],
> extends HashbrownType<Options[number][internal]['result']> {
  [internal]: AnyOfTypeInternals<Options>;
}

export const AnyOfType: HashbrownTypeCtor<AnyOfType> = HashbrownTypeCtor({
  name: 'AnyOfType',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    return {
      anyOf: [],
    };
  },
  parseJsonSchemaImpl: (schema: any, object: unknown, path: string[]) => {
    const options = schema[internal].definition.options;

    let parsedObject = undefined;

    type DiscriminatorEntry = {
      schema: HashbrownType;
      literalKey: string;
      literalValue: string;
    };

    const buildDiscriminatorMap = (
      options: readonly HashbrownType[],
    ): Record<string, DiscriminatorEntry> | null => {
      const map: Record<string, DiscriminatorEntry> = {};

      for (const opt of options) {
        if (!isObjectType(opt)) {
          return null;
        }

        const shape = (opt as any)[internal].definition.shape as Record<
          string,
          HashbrownType
        >;

        const literalEntries = Object.entries(shape).filter(([, v]) =>
          isLiteralType(v as any),
        ) as [string, HashbrownType][];

        // Require exactly one literal for clear discrimination
        if (literalEntries.length !== 1) {
          return null;
        }

        const [literalKey, litSchema] = literalEntries[0];
        const literalValue = (litSchema as any)[internal].definition.value as
          | string
          | number
          | boolean;

        if (typeof literalValue !== 'string') {
          // Only support string-based discriminators for wrapper keys
          return null;
        }

        if (Object.prototype.hasOwnProperty.call(map, literalValue)) {
          // Ambiguous (duplicate) discriminator value
          return null;
        }

        map[literalValue] = { schema: opt, literalKey, literalValue };
      }

      return Object.keys(map).length === options.length ? map : null;
    };

    const discriminatorMap = buildDiscriminatorMap(options);

    for (let i = 0; i < options.length; i++) {
      try {
        if (needsDiscriminatorWrapperInAnyOf(options[i]) && discriminatorMap) {
          const discriminatorEntry = Object.entries(discriminatorMap).find(
            ([, v]) => v.schema === options[i],
          );

          if (!discriminatorEntry) {
            throw new Error(
              `No discriminator key found for option ${options[i]}`,
            );
          }

          const { literalKey, literalValue, schema } = discriminatorEntry[1];

          const extractedObject = (object as any)[literalValue];

          extractedObject[literalKey] = literalValue;

          parsedObject = schema.parseJsonSchema(extractedObject);
        } else if (needsDiscriminatorWrapperInAnyOf(options[i])) {
          if (typeof object !== 'object' || object === null) {
            throw new Error(`Expected an object at: ${path.join('.')}`);
          }

          const anyOfKeys = Object.keys(object);

          if (anyOfKeys.length !== 1) {
            throw new Error(`Malformed anyOf wrapper at ${path.join('.')}`);
          }

          const anyOfIndex = anyOfKeys[0];

          if (anyOfIndex !== i.toString()) {
            throw new Error(
              `Unexpected discriminator value ${anyOfIndex} for option ${i}`,
            );
          }

          parsedObject = options[i].parseJsonSchema(
            (object as any)[anyOfIndex],
          );
        } else {
          parsedObject = options[i].parseJsonSchema(object);
        }
        break;
      } catch (e) {
        // console.log(e);
        // Parsing failed, but that is not unexpected due to the looping.
        // Just try the next option.
        continue;
      }
    }

    if (parsedObject == null) {
      throw new Error(
        `All options in anyOf failed parsing at: ${path.join('.')}`,
      );
    }

    return parsedObject;
  },
  toTypeScriptImpl: (schema: any, pathSeen: Set<HashbrownType>) => {
    if (pathSeen.has(schema)) {
      const desc = schema[internal].definition.description || '<anonymous>';
      throw new Error(`Cycle detected in schema at "${desc}"`);
    }
    pathSeen.add(schema);

    return `/* ${schema[internal].definition.description} */ (${schema[
      internal
    ].definition.options
      .map((opt: any) => opt.toTypeScript(new Set(pathSeen)))
      .join(' | ')})`;
  },
  validateImpl: (schema, definition, object, path) => {
    const { options } = definition;

    let foundMatch = false;

    for (let i = 0; i < options.length; i++) {
      try {
        options[i].validate(object);

        foundMatch = true;

        break;
      } catch (e) {
        // console.log(e);
        // Parsing failed, but that is not unexpected due to the looping.
        // Just try the next option.
        continue;
      }
    }

    if (!foundMatch) {
      throw new Error(
        `All options in anyOf failed parsing at: ${path.join('.')}`,
      );
    }
  },
  toStreamingImpl: (
    schema: any,
    definition,
    object: unknown,
    path: string[],
  ) => {
    const matchingOption = definition.options.find((opt: any) => {
      try {
        opt.validate(object);
        return true;
      } catch (e) {
        return false;
      }
    });

    type DiscriminatorEntry = {
      schema: HashbrownType;
      literalKey: string;
      literalValue: string;
    };

    const buildDiscriminatorMap = (
      options: readonly HashbrownType[],
    ): Record<string, DiscriminatorEntry> | null => {
      const map: Record<string, DiscriminatorEntry> = {};

      for (const opt of options) {
        if (!isObjectType(opt)) {
          return null;
        }

        const shape = (opt as any)[internal].definition.shape as Record<
          string,
          HashbrownType
        >;

        const literalEntries = Object.entries(shape).filter(([, v]) =>
          isLiteralType(v as any),
        ) as [string, HashbrownType][];

        // Require exactly one literal for clear discrimination
        if (literalEntries.length !== 1) {
          return null;
        }

        const [literalKey, litSchema] = literalEntries[0];
        const literalValue = (litSchema as any)[internal].definition.value as
          | string
          | number
          | boolean;

        if (typeof literalValue !== 'string') {
          // Only support string-based discriminators for wrapper keys
          return null;
        }

        if (Object.prototype.hasOwnProperty.call(map, literalValue)) {
          // Ambiguous (duplicate) discriminator value
          return null;
        }

        map[literalValue] = { schema: opt, literalKey, literalValue };
      }

      return Object.keys(map).length === options.length ? map : null;
    };

    const discriminatorMap = buildDiscriminatorMap(definition.options);

    if (!matchingOption) {
      throw new Error(
        `No matching option found in anyOf at: ${path.join('.')}`,
      );
    }

    if (needsDiscriminatorWrapperInAnyOf(matchingOption) && discriminatorMap) {
      const discriminatorEntry = Object.entries(discriminatorMap).find(
        ([, v]) => v.schema === matchingOption,
      );

      if (!discriminatorEntry) {
        throw new Error(
          `No discriminator key found for option ${matchingOption}`,
        );
      }

      const { literalKey, literalValue, schema } = discriminatorEntry[1];
      const streamingObject = schema.toStreaming(object, path);

      delete (streamingObject as any)[literalKey];

      return { [literalValue]: streamingObject };
    } else if (
      needsDiscriminatorWrapperInAnyOf(matchingOption) &&
      !discriminatorMap
    ) {
      const indexOfMatchingOption = definition.options.indexOf(matchingOption);

      return {
        [indexOfMatchingOption.toString()]: matchingOption.toStreaming(
          object,
          path,
        ),
      };
    }

    return matchingOption.toStreaming(object, path);
  },
});

/**
 * @public
 */
export function isAnyOfType(type: HashbrownType): type is AnyOfType {
  return type[internal].definition.type === 'any-of';
}

/**
 * @public
 */
export function anyOf<const Options extends readonly HashbrownType[]>(
  options: Options,
): SchemaForUnion<Options[number][internal]['result']> {
  return new AnyOfType({
    type: 'any-of',
    description: 'any-of',
    options,
    streaming: false,
  }) as SchemaForUnion<Options[number][internal]['result']>;
}

/**
 * --------------------------------------
 * --------------------------------------
 *             Enum Type
 * --------------------------------------
 * --------------------------------------
 */

/**
 * @internal
 */
interface EnumTypeDefinition<out Entries extends readonly any[]>
  extends HashbrownTypeDefinition {
  type: 'enum';
  entries: Entries;
}

/**
 * @internal
 */
export interface EnumTypeInternals<Result extends readonly any[]>
  extends HashbrownTypeInternals<Result[number]> {
  definition: EnumTypeDefinition<Result>;
}

/**
 * @public
 */
export interface EnumType<Entries extends readonly string[] = readonly string[]>
  extends HashbrownType {
  /**
   * @internal
   */
  [internal]: EnumTypeInternals<Entries>;
}

export const EnumType: HashbrownTypeCtor<EnumType> = HashbrownTypeCtor({
  name: 'Enum',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    return {
      type: 'string',
      enum: schema[internal].definition.entries,
      description: schema[internal].definition.description,
    };
  },
  parseJsonSchemaImpl: (schema: any, object: unknown, path: string[]) => {
    // Is this a wrapped primitive?
    if (
      object != null &&
      typeof object === 'object' &&
      Object.keys(object).includes(PRIMITIVE_WRAPPER_FIELD_NAME)
    ) {
      object = (object as any)[PRIMITIVE_WRAPPER_FIELD_NAME];
    }

    if (typeof object !== 'string')
      throw new Error(`Expected a string at: ${path.join('.')}`);
    if (!schema[internal].definition.entries.includes(object))
      throw new Error(`Expected an enum value at: ${path.join('.')}`);

    return object;
  },
  toTypeScriptImpl: (schema: any) => {
    return schema[internal].definition.entries
      .map((e: any) => `"${e}"`)
      .join(' | ');
  },
  validateImpl: (schema, definition, object, path) => {
    if (typeof object !== 'string')
      throw new Error(`Expected a string at: ${path.join('.')}`);
    if (!definition.entries.includes(object))
      throw new Error(`Expected an enum value at: ${path.join('.')}`);
  },
  toStreamingImpl: (
    schema: any,
    definition,
    object: unknown,
    path: string[],
  ) => {
    return object;
  },
});

/**
 * @public
 */
export function isEnumType(type: HashbrownType): type is EnumType {
  return type[internal].definition.type === 'enum';
}

/**
 * @public
 */
export function enumeration<const Entries extends readonly string[]>(
  description: string,
  entries: [...Entries],
): EnumType<Entries> {
  return new EnumType({
    type: 'enum',
    description,
    entries,
    streaming: false,
  }) as any;
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

/**
 * @internal
 */
export interface NullTypeInternals extends HashbrownTypeInternals<null> {
  definition: NullTypeDefinition;
}

/**
 * @public
 */
export interface NullType extends HashbrownType<null> {
  [internal]: NullTypeInternals;
}

export const NullType: HashbrownTypeCtor<NullType> = HashbrownTypeCtor({
  name: 'Null',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    return {
      type: 'null',
      const: schema[internal].definition.value,
      description: schema[internal].definition.description,
    };
  },
  parseJsonSchemaImpl: (schema: any, object: unknown, path: string[]) => {
    // Is this a wrapped primitive?
    if (
      object != null &&
      typeof object === 'object' &&
      Object.keys(object).includes(PRIMITIVE_WRAPPER_FIELD_NAME)
    ) {
      object = (object as any)[PRIMITIVE_WRAPPER_FIELD_NAME];
    }

    if (object !== null)
      throw new Error(`Expected a null at: ${path.join('.')}`);

    return object;
  },
  toTypeScriptImpl: (schema: any) => {
    return `/* ${schema[internal].definition.description} */ null`;
  },
  validateImpl: (schema, definition, object, path) => {
    if (object !== null)
      throw new Error(`Expected a null at: ${path.join('.')}`);
  },
  toStreamingImpl: (
    schema: any,
    definition,
    object: unknown,
    path: string[],
  ) => {
    return object;
  },
});

/**
 * @public
 */
export function isNullType(type: HashbrownType): type is NullType {
  return type[internal].definition.type === 'null';
}

/**
 * @public
 */
export function nullish(): NullType {
  return new NullType({ type: 'null', description: '', streaming: false });
}
/**
 * --------------------------------------
 * --------------------------------------
 *           Streaming Helpers
 * --------------------------------------
 * --------------------------------------
 */
export function needsDiscriminatorWrapperInAnyOf(
  schema: HashbrownType,
): boolean {
  if (
    isAnyOfType(schema) ||
    isArrayType(schema) ||
    isObjectType(schema) ||
    (isStringType(schema) && isStreaming(schema))
  ) {
    return true;
  }

  return false;
}

export function isStreaming(schema: HashbrownType): boolean {
  return schema[internal].definition.streaming;
}

/**
 * @public
 */
export function isHashbrownType(type: any): type is HashbrownType {
  return type[internal] !== undefined;
}

/**
 * --------------------------------------
 * --------------------------------------
 *             Type Utilities
 * --------------------------------------
 * --------------------------------------
 */

/**
 * @public
 */
export type Infer<T extends HashbrownType> = T[internal]['result'];

/**
 * @internal
 */
export type SchemaForUnion<T> = AnyOfType<
  UnionToTuple<T> extends infer U
    ? U extends any[]
      ? { [K in keyof U]: Schema<U[K]> }
      : never
    : never
>;

/**
 * @public
 */
export type Schema<T> =
  IsStringUnion<T> extends true
    ? [T] extends [string]
      ? UnionToTuple<T> extends infer U
        ? U extends string[]
          ? EnumType<U>
          : never
        : never
      : never
    : IsUnion<T> extends true
      ? SchemaForUnion<T>
      : T extends Array<infer U>
        ? ArrayType<Schema<U>>
        : T extends string
          ? string extends T
            ? StringType
            : LiteralType<T>
          : T extends number
            ? NumberType
            : T extends boolean
              ? BooleanType
              : T extends null
                ? NullType
                : T extends object
                  ? ObjectType<{ [K in keyof T]: Schema<T[K]> }>
                  : never;

type R = Schema<'a' | 'b'>;
