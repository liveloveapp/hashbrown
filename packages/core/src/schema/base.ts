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

import type {
  JsonAstNode,
  JsonResolvedValue,
  ParserError,
} from '../skillet/parser/json-parser';
import { internal } from './constants';
import {
  emptyCache,
  ensureCache,
  getNode,
  getSchemaId,
  readCacheValue,
  resolveSchemaAtNode,
  reuseCachedArray,
  reuseCachedObject,
  writeCacheValue,
} from './from-json-ast';
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
export { internal, PRIMITIVE_WRAPPER_FIELD_NAME } from './constants';

type TypeInternals = {
  definition: HashbrownTypeDefinition;
};

export type StringFormat =
  | 'date-time'
  | 'time'
  | 'date'
  | 'duration'
  | 'email'
  | 'hostname'
  | 'ipv4'
  | 'ipv6'
  | 'uuid';

/**
 * @internal
 */
export interface HashbrownTypeCtor<
  T extends HashbrownType,
  D = T[internal]['definition'],
> {
  new (def: D): T;
  init(inst: T, def: D): asserts inst is T;
  toJsonSchema(schema: any): any;
  toTypeScript: (pathSeen?: Set<HashbrownType>) => string;
  fromJsonAstImpl: (schema: HashbrownTypeCtor<T, D>) => FromJsonAstImpl<T>;
}

/**
 * @internal
 */
export const HashbrownTypeCtor = <
  T extends HashbrownType,
  D extends TypeInternals['definition'] = T[internal]['definition'],
>({
  name,
  initializer,
  toJsonSchemaImpl,
  toTypeScriptImpl,
  fromJsonAstImpl,
  validateImpl,
}: {
  name: string;
  initializer: (instance: T, definition: D) => void;
  toJsonSchemaImpl: (schema: HashbrownTypeCtor<T, D>) => any;
  toTypeScriptImpl: (
    schema: HashbrownTypeCtor<T, D>,
    pathSeen: Set<HashbrownType>,
  ) => string;
  fromJsonAstImpl: (schema: HashbrownTypeCtor<T, D>) => FromJsonAstImpl<T>;
  validateImpl: (
    schema: HashbrownTypeCtor<T, D>,
    definition: D,
    object: unknown,
    path: string[],
  ) => void;
}): HashbrownTypeCtor<T, D> => {
  class Class implements Omit<HashbrownType, internal> {
    private toJsonSchemaImpl: (schema: HashbrownTypeCtor<T, D>) => any;
    private toTypeScriptImpl: (
      schema: HashbrownTypeCtor<T, D>,
      pathSeen: Set<HashbrownType>,
    ) => string;
    private fromJsonAstImpl: (
      input: FromJsonAstInput,
    ) => FromJsonAstOutput<any>;
    private validateImpl: (
      schema: HashbrownTypeCtor<T, D>,
      definition: D,
      object: unknown,
      path: string[],
    ) => void;

    constructor(definition: D) {
      Class.init(this as any, definition);
      this.toJsonSchemaImpl = toJsonSchemaImpl;
      this.toTypeScriptImpl = toTypeScriptImpl;
      this.fromJsonAstImpl = fromJsonAstImpl(this as any) as (
        input: FromJsonAstInput,
      ) => FromJsonAstOutput<any>;
      this.validateImpl = validateImpl;
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

    toTypeScript(pathSeen: Set<HashbrownType> = new Set()) {
      return this.toTypeScriptImpl(this as any, pathSeen);
    }

    fromJsonAst(input: FromJsonAstInput) {
      return this.fromJsonAstImpl(input);
    }

    validate(object: unknown, path: string[] = []) {
      return this.validateImpl(
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
    | 'null'
    | 'node';
  description: string;
  streaming: boolean;
}
/**
 * @public
 */
export interface HashbrownType<out Result = unknown> {
  [internal]: HashbrownTypeInternals<Result>;
  toJsonSchema: () => any;
  validate: (object: unknown, path?: string[]) => void;
  toTypeScript: (pathSeen?: Set<HashbrownType>) => string;
  fromJsonAst: (input: FromJsonAstInput) => FromJsonAstOutput<Result>;
}

/**
 * @internal
 */
export interface HashbrownTypeInternals<out Result = unknown>
  extends HashbrownType<Result> {
  definition: HashbrownTypeDefinition;
  result: Result;
}

/**
 * @public
 */
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
    toTypeScriptImpl: () => {
      return '';
    },
    fromJsonAstImpl: () => {
      return (input: FromJsonAstInput) => ({
        result: { state: 'invalid' },
        cache: input.cache ?? emptyCache,
      });
    },
    validateImpl: () => {
      return;
    },
  });

export type FromJsonAstInput = {
  nodes: JsonAstNode[];
  rootId: number | null;
  error: ParserError | null;
  cache?: FromJsonAstCache;
  schemaId: number;
  schema: HashbrownType;
};

export type FromJsonAstResult<T> =
  | { state: 'match'; value: T }
  | { state: 'no-match' }
  | { state: 'invalid' };

export type FromJsonAstCache = {
  byNodeId: Record<number, JsonResolvedValue>;
  byNodeIdAndSchemaId: Record<string, JsonResolvedValue>;
};

export type FromJsonAstOutput<T> = {
  result: FromJsonAstResult<T>;
  cache: FromJsonAstCache;
};

type FromJsonAstImpl<T extends HashbrownType> = (
  input: FromJsonAstInput,
) => FromJsonAstOutput<T[internal]['result']>;

const FORBIDDEN_OBJECT_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

function isForbiddenObjectKey(key: string) {
  return FORBIDDEN_OBJECT_KEYS.has(key);
}

function formatPath(path: string[]) {
  return path.length === 0 ? '<root>' : path.join('.');
}

const stringPatternCache = new WeakMap<StringTypeDefinition, RegExp>();

function getPatternRegex(definition: StringTypeDefinition) {
  if (!definition.pattern) {
    return undefined;
  }

  const cached = stringPatternCache.get(definition);
  if (cached && cached.source === definition.pattern) {
    return cached;
  }

  let regex: RegExp;
  try {
    regex = new RegExp(definition.pattern);
  } catch (error) {
    throw new Error(
      `Invalid string pattern "${definition.pattern}": ${(error as Error).message}`,
    );
  }
  stringPatternCache.set(definition, regex);
  return regex;
}

function validateNumberConstraints(
  definition: NumberConstraints,
  value: number,
  path: string[],
) {
  const formattedPath = formatPath(path);

  if (!Number.isFinite(value)) {
    throw new Error(`Expected a finite number at: ${formattedPath}`);
  }

  if (definition.multipleOf !== undefined) {
    if (definition.multipleOf <= 0 || !Number.isFinite(definition.multipleOf)) {
      throw new Error(`multipleOf must be > 0 at: ${formattedPath}`);
    }

    const ratio = value / definition.multipleOf;
    const rounded = Math.round(ratio);
    const epsilon = Number.EPSILON * Math.max(1, Math.abs(ratio));
    if (Math.abs(ratio - rounded) > epsilon) {
      throw new Error(
        `Expected a multipleOf ${definition.multipleOf} at: ${formattedPath}`,
      );
    }
  }

  if (definition.maximum !== undefined && value > definition.maximum) {
    throw new Error(`Expected <= ${definition.maximum} at: ${formattedPath}`);
  }
  if (
    definition.exclusiveMaximum !== undefined &&
    value >= definition.exclusiveMaximum
  ) {
    throw new Error(
      `Expected < ${definition.exclusiveMaximum} at: ${formattedPath}`,
    );
  }
  if (definition.minimum !== undefined && value < definition.minimum) {
    throw new Error(`Expected >= ${definition.minimum} at: ${formattedPath}`);
  }
  if (
    definition.exclusiveMinimum !== undefined &&
    value <= definition.exclusiveMinimum
  ) {
    throw new Error(
      `Expected > ${definition.exclusiveMinimum} at: ${formattedPath}`,
    );
  }
}

/**
 * --------------------------------------
 * --------------------------------------
 *             String Type
 * --------------------------------------
 * --------------------------------------
 */

interface StringTypeDefinition extends HashbrownTypeDefinition {
  type: 'string';
  pattern?: string;
  format?: StringFormat;
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

export type StringConstraintsInput = {
  pattern?: string | RegExp;
  format?: StringFormat;
};

type StringConstraints = {
  pattern?: string;
  format?: StringFormat;
};

type NumberConstraints = {
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;
};

/**
 * @public
 */
export const StringType: HashbrownTypeCtor<StringType> = HashbrownTypeCtor({
  name: 'String',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    const definition = schema[internal].definition as StringTypeDefinition;
    const result: Record<string, unknown> = {
      type: 'string',
      description: definition.description,
    };
    if (definition.pattern !== undefined) {
      result['pattern'] = definition.pattern;
    }
    if (definition.format !== undefined) {
      result['format'] = definition.format;
    }
    return result;
  },
  toTypeScriptImpl: (schema: any) => {
    return `/* ${schema[internal].definition.description} */ string`;
  },
  fromJsonAstImpl: (schema: any) => {
    return (input) => {
      const cache = ensureCache(input.cache);
      if (input.error) {
        return { result: { state: 'invalid' }, cache };
      }

      const node = getNode(input.nodes, input.rootId);
      if (!node || node.type !== 'string') {
        return { result: { state: 'no-match' }, cache };
      }

      const stringNode = node as Extract<JsonAstNode, { type: 'string' }>;
      if (schema[internal].definition.streaming) {
        const value = node.closed ? node.resolvedValue : stringNode.buffer;
        if (value === undefined) {
          return { result: { state: 'no-match' }, cache };
        }
        return { result: { state: 'match', value }, cache };
      }

      if (!node.closed || node.resolvedValue === undefined) {
        return { result: { state: 'no-match' }, cache };
      }

      return { result: { state: 'match', value: node.resolvedValue }, cache };
    };
  },
  validateImpl: (schema: any, definition, object: unknown, path: string[]) => {
    const formattedPath = formatPath(path);
    if (typeof object !== 'string') {
      throw new Error(
        `Expected a string at: ${formattedPath}, got ${typeof object}`,
      );
    }
    if (definition.pattern !== undefined) {
      const regex = getPatternRegex(definition);
      if (!regex) {
        throw new Error(`Invalid string pattern at: ${formattedPath}`);
      }
      if (!regex.test(object)) {
        throw new Error(
          `Expected a string matching pattern at: ${formattedPath}`,
        );
      }
    }
    return;
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
export function string(
  description: string,
  constraints?: StringConstraintsInput,
): StringType {
  const normalized: StringConstraints = normalizeStringConstraints(constraints);
  return new StringType({
    type: 'string',
    description,
    streaming: false,
    ...normalized,
  });
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

/**
 * @public
 */
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
  toTypeScriptImpl: (schema: any) => {
    return JSON.stringify(schema[internal].definition.value);
  },
  fromJsonAstImpl: (schema: any) => {
    return (input) => {
      const cache = ensureCache(input.cache);
      if (input.error) {
        return { result: { state: 'invalid' }, cache };
      }

      const node = getNode(input.nodes, input.rootId);
      if (!node || !node.closed || node.resolvedValue === undefined) {
        return { result: { state: 'no-match' }, cache };
      }

      const expected = schema[internal].definition.value;
      if (node.resolvedValue !== expected) {
        return { result: { state: 'no-match' }, cache };
      }

      if (typeof expected === 'string' && node.type !== 'string') {
        return { result: { state: 'no-match' }, cache };
      }

      if (typeof expected === 'number' && node.type !== 'number') {
        return { result: { state: 'no-match' }, cache };
      }

      if (typeof expected === 'boolean' && node.type !== 'boolean') {
        return { result: { state: 'no-match' }, cache };
      }

      return { result: { state: 'match', value: expected }, cache };
    };
  },
  validateImpl: (schema, definition, object, path) => {
    if (definition.value !== object) {
      throw new Error(
        `Expected the literal value ${JSON.stringify(definition.value)} at: ${path.join('.')}, but got ${JSON.stringify(object)}`,
      );
    }
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
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;
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

/**
 * @public
 */
export const NumberType: HashbrownTypeCtor<NumberType> = HashbrownTypeCtor({
  name: 'Number',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    const definition = schema[internal].definition as NumberTypeDefinition;
    const result: Record<string, unknown> = {
      type: 'number',
      description: definition.description,
    };
    if (definition.multipleOf !== undefined) {
      result['multipleOf'] = definition.multipleOf;
    }
    if (definition.maximum !== undefined) {
      result['maximum'] = definition.maximum;
    }
    if (definition.exclusiveMaximum !== undefined) {
      result['exclusiveMaximum'] = definition.exclusiveMaximum;
    }
    if (definition.minimum !== undefined) {
      result['minimum'] = definition.minimum;
    }
    if (definition.exclusiveMinimum !== undefined) {
      result['exclusiveMinimum'] = definition.exclusiveMinimum;
    }
    return result;
  },
  toTypeScriptImpl: (schema: any) => {
    return `/* ${schema[internal].definition.description} */ number`;
  },
  fromJsonAstImpl: () => {
    return (input) => {
      const cache = ensureCache(input.cache);
      if (input.error) {
        return { result: { state: 'invalid' }, cache };
      }

      const node = getNode(input.nodes, input.rootId);
      if (!node || node.type !== 'number') {
        return { result: { state: 'no-match' }, cache };
      }

      if (!node.closed || node.resolvedValue === undefined) {
        return { result: { state: 'no-match' }, cache };
      }

      return { result: { state: 'match', value: node.resolvedValue }, cache };
    };
  },
  validateImpl: (schema, definition, object, path) => {
    if (typeof object !== 'number') {
      throw new Error(`Expected a number at: ${path.join('.')}`);
    }
    validateNumberConstraints(definition, object, path);
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
export function number(description: string, constraints?: NumberConstraints) {
  return new NumberType({
    type: 'number',
    description,
    streaming: false,
    ...constraints,
  });
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

/**
 * @public
 */
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
  toTypeScriptImpl: (schema: any) => {
    return `/* ${schema[internal].definition.description} */ boolean`;
  },
  fromJsonAstImpl: () => {
    return (input) => {
      const cache = ensureCache(input.cache);
      if (input.error) {
        return { result: { state: 'invalid' }, cache };
      }

      const node = getNode(input.nodes, input.rootId);
      if (!node || node.type !== 'boolean') {
        return { result: { state: 'no-match' }, cache };
      }

      if (!node.closed || node.resolvedValue === undefined) {
        return { result: { state: 'no-match' }, cache };
      }

      return { result: { state: 'match', value: node.resolvedValue }, cache };
    };
  },
  validateImpl: (schema, definition, object, path) => {
    if (typeof object !== 'boolean')
      throw new Error(`Expected a boolean at: ${path.join('.')}`);
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
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;
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

/**
 * @public
 */
export const IntegerType: HashbrownTypeCtor<IntegerType> = HashbrownTypeCtor({
  name: 'Integer',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    const definition = schema[internal].definition as IntegerTypeDefinition;
    const result: Record<string, unknown> = {
      type: 'integer',
      description: definition.description,
    };
    if (definition.multipleOf !== undefined) {
      result['multipleOf'] = definition.multipleOf;
    }
    if (definition.maximum !== undefined) {
      result['maximum'] = definition.maximum;
    }
    if (definition.exclusiveMaximum !== undefined) {
      result['exclusiveMaximum'] = definition.exclusiveMaximum;
    }
    if (definition.minimum !== undefined) {
      result['minimum'] = definition.minimum;
    }
    if (definition.exclusiveMinimum !== undefined) {
      result['exclusiveMinimum'] = definition.exclusiveMinimum;
    }
    return result;
  },
  toTypeScriptImpl: (schema: any) => {
    return `/* ${schema[internal].definition.description} */ integer`;
  },
  fromJsonAstImpl: () => {
    return (input) => {
      const cache = ensureCache(input.cache);
      if (input.error) {
        return { result: { state: 'invalid' }, cache };
      }

      const node = getNode(input.nodes, input.rootId);
      if (!node || node.type !== 'number') {
        return { result: { state: 'no-match' }, cache };
      }

      if (!node.closed || node.resolvedValue === undefined) {
        return { result: { state: 'no-match' }, cache };
      }

      if (!Number.isInteger(node.resolvedValue)) {
        return { result: { state: 'no-match' }, cache };
      }

      return { result: { state: 'match', value: node.resolvedValue }, cache };
    };
  },
  validateImpl: (schema, definition, object, path) => {
    if (typeof object !== 'number')
      throw new Error(`Expected a number at: ${path.join('.')}`);
    if (!Number.isInteger(object))
      throw new Error(`Expected an integer at: ${path.join('.')}`);
    validateNumberConstraints(definition, object, path);
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
export function integer(description: string, constraints?: NumberConstraints) {
  return new IntegerType({
    type: 'integer',
    description,
    streaming: false,
    ...constraints,
  });
}

function normalizeStringConstraints(
  constraints?: StringConstraintsInput,
): StringConstraints {
  if (!constraints) {
    return {};
  }

  const pattern =
    constraints.pattern instanceof RegExp
      ? constraints.pattern.source
      : constraints.pattern;

  return {
    pattern,
    format: constraints.format,
  };
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

/**
 * @public
 */
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
  fromJsonAstImpl: (schema: any) => {
    return (input) => {
      const cache = ensureCache(input.cache);
      if (input.error) {
        return { result: { state: 'invalid' }, cache };
      }

      const node = getNode(input.nodes, input.rootId);
      if (!node || node.type !== 'object') {
        return { result: { state: 'no-match' }, cache };
      }

      const isStreamingSchema = schema[internal].definition.streaming;
      const shape = schema[internal].definition.shape as Record<
        string,
        HashbrownType
      >;
      const shapeKeys = new Set(Object.keys(shape));
      const childMap: Record<string, number> = Object.create(null);

      for (let i = 0; i < node.keys.length; i += 1) {
        const key = node.keys[i];
        if (isForbiddenObjectKey(key)) {
          return { result: { state: 'no-match' }, cache };
        }

        if (!shapeKeys.has(key)) {
          return { result: { state: 'no-match' }, cache };
        }

        childMap[key] = node.children[i];
      }

      const resultValue: Record<string, JsonResolvedValue> = {};
      let nextCache = cache;

      for (const [key, childSchema] of Object.entries(shape)) {
        const childId = childMap[key];
        if (childId === undefined) {
          if (!isStreamingSchema) {
            return { result: { state: 'no-match' }, cache: nextCache };
          }
          continue;
        }

        const childOutput = resolveSchemaAtNode(
          childSchema,
          input,
          nextCache,
          childId,
        );

        if (childOutput.result.state === 'invalid') {
          return { result: { state: 'invalid' }, cache: childOutput.cache };
        }

        if (childOutput.result.state === 'no-match') {
          if (!isStreamingSchema) {
            return { result: { state: 'no-match' }, cache: childOutput.cache };
          }
          continue;
        }

        resultValue[key] = childOutput.result.value as JsonResolvedValue;
        nextCache = childOutput.cache;
      }

      let candidate = resultValue;
      if (node.resolvedValue) {
        const reused = reuseCachedObject(node.resolvedValue, resultValue);
        if (reused) {
          candidate = reused;
        }
      }

      const cached = readCacheValue(nextCache, node.id, input.schemaId, true);
      const reusedCached = reuseCachedObject(cached, candidate);
      const value = reusedCached ?? candidate;
      const updatedCache = writeCacheValue(
        nextCache,
        node.id,
        input.schemaId,
        true,
        value,
      );

      return { result: { state: 'match', value }, cache: updatedCache };
    };
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
  minItems?: number;
  maxItems?: number;
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

/**
 * @public
 */
export const ArrayType: HashbrownTypeCtor<ArrayType> = HashbrownTypeCtor({
  name: 'Array',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    const definition = schema[internal].definition as ArrayTypeDefinition;
    const result: Record<string, unknown> = {
      type: 'array',
      // items is populated externally since we find loops and duplicated sections
      // through the whole schema
      items: [],
      description: definition.description,
    };
    if (definition.minItems !== undefined) {
      result['minItems'] = definition.minItems;
    }
    if (definition.maxItems !== undefined) {
      result['maxItems'] = definition.maxItems;
    }
    return result;
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
  fromJsonAstImpl: (schema: any) => {
    return (input) => {
      const cache = ensureCache(input.cache);
      if (input.error) {
        return { result: { state: 'invalid' }, cache };
      }

      const node = getNode(input.nodes, input.rootId);
      if (!node || node.type !== 'array') {
        return { result: { state: 'no-match' }, cache };
      }

      const isStreamingSchema = schema[internal].definition.streaming;
      if (!isStreamingSchema && !node.closed) {
        return { result: { state: 'no-match' }, cache };
      }

      const elementSchema = schema[internal].definition.element;
      const values: JsonResolvedValue[] = [];
      let nextCache = cache;

      for (const childId of node.children) {
        const childOutput = resolveSchemaAtNode(
          elementSchema,
          input,
          nextCache,
          childId,
        );

        if (childOutput.result.state === 'invalid') {
          return { result: { state: 'invalid' }, cache: childOutput.cache };
        }

        if (childOutput.result.state === 'no-match') {
          if (!isStreamingSchema) {
            return { result: { state: 'no-match' }, cache: childOutput.cache };
          }
          continue;
        }

        values.push(childOutput.result.value as JsonResolvedValue);
        nextCache = childOutput.cache;
      }

      let candidate = values;
      if (Array.isArray(node.resolvedValue)) {
        const reused = reuseCachedArray(node.resolvedValue, values);
        if (reused) {
          candidate = reused;
        }
      }

      const cached = readCacheValue(nextCache, node.id, input.schemaId, true);
      const reusedCached = reuseCachedArray(cached, candidate);
      const value = reusedCached ?? candidate;
      const updatedCache = writeCacheValue(
        nextCache,
        node.id,
        input.schemaId,
        true,
        value,
      );

      return { result: { state: 'match', value }, cache: updatedCache };
    };
  },
  validateImpl: (schema, definition, object, path) => {
    if (!Array.isArray(object))
      throw new Error(`Expected an array at: ${formatPath(path)}`);

    if (
      definition.minItems !== undefined &&
      object.length < definition.minItems
    ) {
      throw new Error(
        `Expected at least ${definition.minItems} items at: ${formatPath(path)}`,
      );
    }

    if (
      definition.maxItems !== undefined &&
      object.length > definition.maxItems
    ) {
      throw new Error(
        `Expected at most ${definition.maxItems} items at: ${formatPath(path)}`,
      );
    }

    object.forEach((item) => {
      definition.element.validate(item, path);
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
  constraints?: { minItems?: number; maxItems?: number },
): ArrayType<Item> {
  return new ArrayType({
    type: 'array',
    description,
    streaming: false,
    element: item,
    ...constraints,
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

/**
 * @public
 */
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
  fromJsonAstImpl: (schema: any) => {
    return (input) => {
      let nextCache = ensureCache(input.cache);
      if (input.error) {
        return { result: { state: 'invalid' }, cache: nextCache };
      }

      let invalidCount = 0;
      const options = schema[internal].definition.options;

      for (const option of options) {
        const output = resolveSchemaAtNode(
          option,
          input,
          nextCache,
          input.rootId,
        );

        nextCache = output.cache;

        if (output.result.state === 'match') {
          return output;
        }

        if (output.result.state === 'invalid') {
          invalidCount += 1;
        }
      }

      if (invalidCount === options.length) {
        return { result: { state: 'invalid' }, cache: nextCache };
      }

      return { result: { state: 'no-match' }, cache: nextCache };
    };
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
export function isNodeType(type: HashbrownType): type is NodeType {
  return type[internal].definition.type === 'node';
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
 *             Node Type
 * --------------------------------------
 * --------------------------------------
 */

type NodeResult<Inner extends HashbrownType> = {
  complete: boolean;
  partialValue: JsonResolvedValue;
  value?: Inner[internal]['result'];
};

interface NodeTypeDefinition<Inner extends HashbrownType = HashbrownType>
  extends HashbrownTypeDefinition {
  type: 'node';
  inner: Inner;
}

/**
 * @internal
 */
export interface NodeTypeInternals<Inner extends HashbrownType = HashbrownType>
  extends HashbrownTypeInternals<NodeResult<Inner>> {
  definition: NodeTypeDefinition<Inner>;
}

/**
 * @public
 */
export interface NodeType<Inner extends HashbrownType = HashbrownType>
  extends HashbrownType<NodeResult<Inner>> {
  [internal]: NodeTypeInternals<Inner>;
}

/**
 * @public
 */
export const NodeType: HashbrownTypeCtor<NodeType> = HashbrownTypeCtor({
  name: 'Node',
  initializer: (inst, def) => {
    HashbrownType.init(inst, def);
  },
  toJsonSchemaImpl: (schema: any) => {
    return schema[internal].definition.inner.toJsonSchema();
  },
  toTypeScriptImpl: (schema: any, pathSeen: Set<HashbrownType>) => {
    return schema[internal].definition.inner.toTypeScript(pathSeen);
  },
  fromJsonAstImpl: (schema: any) => {
    return (input) => {
      const cache = ensureCache(input.cache);
      if (input.error) {
        return { result: { state: 'invalid' }, cache };
      }

      const node = getNode(input.nodes, input.rootId);
      if (!node) {
        return { result: { state: 'no-match' }, cache };
      }

      const innerSchema = schema[internal].definition.inner;
      const innerOutput = resolveSchemaAtNode(
        innerSchema,
        input,
        cache,
        node.id,
      );

      if (innerOutput.result.state === 'invalid') {
        return { result: { state: 'invalid' }, cache: innerOutput.cache };
      }

      const value =
        innerOutput.result.state === 'match'
          ? innerOutput.result.value
          : undefined;

      return {
        result: {
          state: 'match',
          value: {
            complete: node.closed,
            partialValue: node.resolvedValue,
            value,
          },
        },
        cache: innerOutput.cache,
      };
    };
  },
  validateImpl: (schema, definition, object, path) => {
    if (!object || typeof object !== 'object') {
      throw new Error('Expected node value to be an object.');
    }

    const node = object as {
      complete?: unknown;
      partialValue?: unknown;
      value?: unknown;
    };

    const isNodeWrapper = 'complete' in node || 'partialValue' in node;

    if (isNodeWrapper) {
      if (typeof node.complete !== 'boolean') {
        throw new Error('Expected node.complete to be a boolean.');
      }

      if (!('partialValue' in node)) {
        throw new Error('Expected node.partialValue to be present.');
      }

      if ('value' in node && node.value !== undefined) {
        definition.inner.validate(node.value, [...path, 'value']);
      }

      return;
    }

    definition.inner.validate(object, path);
  },
});

/**
 * @public
 */
export function node<Inner extends HashbrownType>(
  inner: Inner,
): NodeType<Inner> {
  return new NodeType({
    type: 'node',
    description: inner[internal].definition.description,
    streaming: true,
    inner,
  }) as any;
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

/**
 * @public
 */
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
  toTypeScriptImpl: (schema: any) => {
    return schema[internal].definition.entries
      .map((e: any) => `"${e}"`)
      .join(' | ');
  },
  fromJsonAstImpl: (schema: any) => {
    return (input) => {
      const cache = ensureCache(input.cache);
      if (input.error) {
        return { result: { state: 'invalid' }, cache };
      }

      const node = getNode(input.nodes, input.rootId);
      if (!node || node.type !== 'string') {
        return { result: { state: 'no-match' }, cache };
      }

      if (!node.closed || node.resolvedValue === undefined) {
        return { result: { state: 'no-match' }, cache };
      }

      if (!schema[internal].definition.entries.includes(node.resolvedValue)) {
        return { result: { state: 'no-match' }, cache };
      }

      return { result: { state: 'match', value: node.resolvedValue }, cache };
    };
  },
  validateImpl: (schema, definition, object, path) => {
    if (typeof object !== 'string')
      throw new Error(`Expected a string at: ${path.join('.')}`);
    if (!definition.entries.includes(object))
      throw new Error(`Expected an enum value at: ${path.join('.')}`);
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

/**
 * @public
 */
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
  toTypeScriptImpl: (schema: any) => {
    return `/* ${schema[internal].definition.description} */ null`;
  },
  fromJsonAstImpl: () => {
    return (input) => {
      const cache = ensureCache(input.cache);
      if (input.error) {
        return { result: { state: 'invalid' }, cache };
      }

      const node = getNode(input.nodes, input.rootId);
      if (!node || node.type !== 'null') {
        return { result: { state: 'no-match' }, cache };
      }

      if (!node.closed || node.resolvedValue === undefined) {
        return { result: { state: 'no-match' }, cache };
      }

      return { result: { state: 'match', value: null }, cache };
    };
  },
  validateImpl: (schema, definition, object, path) => {
    if (object !== null)
      throw new Error(`Expected a null at: ${path.join('.')}`);
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
