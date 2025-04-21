const output = Symbol('output');

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace s {
  export type SchemaType<T> = {
    [output]: T;
  };

  export interface StringType {
    type: 'string';
    description: string;
    [output]: string;
  }

  // New interface for constant (literal) strings
  export interface ConstStringType<T extends string> {
    type: 'const-string';
    description: string;
    value: T;
    [output]: T;
  }

  export interface NumberType {
    type: 'number';
    description: string;
    [output]: number;
  }

  export interface BooleanType {
    type: 'boolean';
    description: string;
    [output]: boolean;
  }

  export interface IntegerType {
    type: 'integer';
    description: string;
    [output]: number;
  }

  export interface ObjectType<V extends Record<string, AnyType>> {
    type: 'object';
    description: string;
    properties: V;
    [output]: { [K in keyof V]: Infer<V[K]> };
  }

  export interface ArrayType<T extends AnyType> {
    type: 'array';
    description: string;
    items: T;
    [output]: Infer<T>[];
  }

  export interface EnumType<T extends string[]> {
    type: 'enum';
    description: string;
    enum: [...T];
    [output]: T[number];
  }

  export interface AnyOfType<T extends AnyType[]> {
    type: 'anyOf';
    description: string;
    anyOf: T;
    [output]: Infer<T[number]>;
  }

  export interface NullType {
    type: 'null';
    description: string;
    [output]: null;
  }

  export type AnyType =
    | StringType
    | ConstStringType<string>
    | NumberType
    | BooleanType
    | IntegerType
    | ObjectType<Record<string, any>>
    | ArrayType<any>
    | EnumType<string[]>
    | AnyOfType<any[]>
    | NullType;

  export type Infer<T extends SchemaType<any>> = T[typeof output];

  // Detects if T is a union type.
  type IsUnion<T, U = T> = T extends any
    ? [U] extends [T]
      ? false
      : true
    : never;

  // Converts a union to an intersection.
  type UnionToIntersection<U> = (
    U extends any ? (x: U) => any : never
  ) extends (x: infer I) => any
    ? I
    : never;

  // Gets the "last" member of a union.
  type LastOf<T> =
    UnionToIntersection<T extends any ? (x: T) => any : never> extends (
      x: infer L,
    ) => any
      ? L
      : never;

  // Converts a union type to a tuple.
  type UnionToTuple<T, L = LastOf<T>> = [T] extends [never]
    ? []
    : [...UnionToTuple<Exclude<T, L>>, L];

  // Maps a union type T to an AnyOfType whose anyOf is a tuple of schemas.
  type SchemaForUnion<T> = AnyOfType<
    UnionToTuple<T> extends infer U
      ? U extends any[]
        ? { [K in keyof U]: Schema<U[K]> }
        : never
      : never
  >;

  // --- Updated Schema mapping ---
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
}

export const s = {
  object<T extends Record<string, s.AnyType>>(
    description: string,
    properties: T,
  ): s.ObjectType<T> {
    return {
      type: 'object',
      description,
      properties,
      [output]: {} as { [K in keyof T]: s.Infer<T[K]> },
    };
  },
  string(description: string): s.StringType {
    return {
      type: 'string',
      description,
      [output]: '' as string,
    };
  },
  // New helper for constant strings
  constString<T extends string>(
    description: string,
    value: T,
  ): s.ConstStringType<T> {
    return {
      type: 'const-string',
      description,
      value,
      [output]: value,
    };
  },
  number(description: string): s.NumberType {
    return {
      type: 'number',
      description,
      [output]: 0 as number,
    };
  },
  boolean(description: string): s.BooleanType {
    return {
      type: 'boolean',
      description,
      [output]: false as boolean,
    };
  },
  /**
   * Defines an integer type. An integer is a whole number,
   * and may not have a decimal point.
   *
   * @param description - The description of the integer
   * @returns The integer schema
   */
  integer(description: string): s.IntegerType {
    return {
      type: 'integer',
      description,
      [output]: 0 as number,
    };
  },
  enum<T extends string[]>(description: string, enumValues: T): s.EnumType<T> {
    return {
      type: 'enum',
      description,
      enum: enumValues,
      [output]: enumValues[0] as T[number],
    };
  },
  anyOf<T extends s.AnyType[]>(description: string, anyOf: T): s.AnyOfType<T> {
    return {
      type: 'anyOf',
      description,
      anyOf,
      [output]: anyOf[0] as s.Infer<T[number]>,
    };
  },
  array<T extends s.AnyType>(description: string, items: T): s.ArrayType<T> {
    return {
      type: 'array',
      description,
      items,
      [output]: [] as s.Infer<T>[],
    };
  },
  null(description: string): s.NullType {
    return {
      type: 'null',
      description,
      [output]: null,
    };
  },
  toJsonSchema(schema: s.AnyType): Record<string, unknown> {
    switch (schema.type) {
      case 'string':
        return {
          type: schema.type,
          description: schema.description,
        };
      case 'const-string': {
        return {
          type: 'string',
          description: schema.description,
          const: schema.value,
        };
      }
      case 'number':
      case 'boolean':
      case 'integer':
      case 'null':
        return {
          type: schema.type,
          description: schema.description,
        };

      case 'object': {
        const properties: Record<string, object> = {};
        const required: string[] = [];
        for (const key in schema.properties) {
          properties[key] = s.toJsonSchema(schema.properties[key]);
          required.push(key);
        }
        return {
          type: 'object',
          description: schema.description,
          properties,
          required,
          additionalProperties: false,
        };
      }

      case 'array': {
        return {
          type: 'array',
          description: schema.description,
          items: s.toJsonSchema(
            (schema as unknown as s.ArrayType<s.AnyType>).items,
          ),
        };
      }

      case 'enum': {
        return {
          type: 'string',
          description: schema.description,
          enum: schema.enum,
        };
      }

      case 'anyOf': {
        return {
          description: schema.description,
          anyOf: (schema as unknown as s.AnyOfType<s.AnyType[]>).anyOf.map(
            (subSchema) => s.toJsonSchema(subSchema),
          ),
        };
      }

      default:
        throw new Error(
          `Unsupported schema type: ${(schema as s.AnyType).type}`,
        );
    }
  },
  toOpenApiSchema(schema: s.AnyType): Record<string, unknown> {
    switch (schema.type) {
      case 'string':
        return {
          type: 'string',
          description: schema.description,
        };

      case 'const-string':
        return {
          type: 'string',
          description: schema.description,
          enum: [schema.value],
        };

      case 'number':
      case 'boolean':
      case 'integer':
      case 'null':
        // note: OpenAPI 3.0 uses "integer" for whole numbers; "null" isn't a type but you can allow it via nullable
        if (schema.type === 'null') {
          return {
            nullable: true,
            description: schema.description,
          };
        }
        return {
          type: schema.type,
          description: schema.description,
        };

      case 'object': {
        const properties: Record<string, object> = {};
        const required: string[] = [];
        for (const key in schema.properties) {
          properties[key] = s.toOpenApiSchema(schema.properties[key]);
          required.push(key);
        }
        return {
          type: 'object',
          // description: schema.description,
          properties: properties,
          required: required,
        };
      }

      case 'array':
        return {
          type: 'array',
          description: schema.description,
          items: s.toOpenApiSchema((schema as s.ArrayType<s.AnyType>).items),
        };

      case 'enum':
        return {
          type: 'string',
          description: schema.description,
          enum: schema.enum,
        };

      case 'anyOf':
        return {
          description: schema.description,
          anyOf: (schema as s.AnyOfType<s.AnyType[]>).anyOf.map(
            (sub: s.AnyType) => s.toOpenApiSchema(sub),
          ),
        };

      default:
        throw new Error(
          `Unsupported schema type: ${(schema as s.AnyType).type}`,
        );
    }
  },
  /**
   * Recursively parses an unknown value according to the given schema.
   *
   * @param schema - The schema to validate against.
   * @param value - The unknown value to parse.
   * @returns The value typed as s.Infer<typeof schema> if valid.
   * @throws Error if the value does not match the schema.
   */
  parse<T extends s.AnyType>(schema: T, value: unknown): s.Infer<T> {
    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`Expected string but got ${typeof value}`);
        }
        return value as s.Infer<T>;

      case 'const-string': {
        if (value !== schema.value) {
          throw new Error(
            `Expected constant string ${schema.value} but got ${value}`,
          );
        }
        return schema.value as s.Infer<T>;
      }

      case 'number':
        if (typeof value !== 'number') {
          throw new Error(`Expected number but got ${typeof value}`);
        }
        return value as s.Infer<T>;

      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new Error(`Expected boolean but got ${typeof value}`);
        }
        return value as s.Infer<T>;

      case 'integer':
        if (typeof value !== 'number' || value % 1 !== 0) {
          throw new Error(`Expected integer but got ${value}`);
        }
        return value as s.Infer<T>;

      case 'null':
        if (value !== null) {
          throw new Error(`Expected null but got ${typeof value}`);
        }
        return null as s.Infer<T>;

      case 'object': {
        if (typeof value !== 'object' || value === null) {
          throw new Error(`Expected object but got ${value}`);
        }
        const schemaObj = schema as s.ObjectType<Record<string, s.AnyType>>;
        const obj = value as Record<string, unknown>;
        const parsedObj: Record<string, unknown> = {};
        for (const key in schemaObj.properties) {
          if (!(key in obj)) {
            throw new Error(`Missing property: ${key}`);
          }
          parsedObj[key] = s.parse(
            schemaObj.properties[key] as unknown as s.Schema<unknown>,
            obj[key],
          );
        }
        return parsedObj as s.Infer<T>;
      }

      case 'array': {
        if (!Array.isArray(value)) {
          throw new Error(`Expected array but got ${typeof value}`);
        }
        return value.map((item) => s.parse(schema.items, item)) as s.Infer<T>;
      }

      case 'enum': {
        const enumSchema = schema as s.EnumType<string[]>;
        if (typeof value !== 'string' || !enumSchema.enum.includes(value)) {
          throw new Error(
            `Expected one of [${enumSchema.enum.join(', ')}] but got ${value}`,
          );
        }
        return value as s.Infer<T>;
      }

      case 'anyOf': {
        let lastError: unknown;
        for (const subSchema of schema.anyOf as s.AnyType[]) {
          try {
            return s.parse(subSchema, value) as s.Infer<T>;
          } catch (err) {
            lastError = err;
          }
        }
        throw new Error(
          `Value does not match any of the provided schemas. Last error: ${
            (lastError as Error)?.message || lastError
          }`,
        );
      }

      default:
        throw new Error(
          `Unsupported schema type: ${
            (schema as unknown as { type: string }).type
          }`,
        );
    }
  },
};
