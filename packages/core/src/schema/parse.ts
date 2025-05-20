import * as s from './base';

export function parseJsonSchema<T extends s.HashbrownType>(
  schema: T,
  object: unknown,
  path: string[] = [],
): s.Infer<T> {
  if (s.isStringType(schema)) {
    if (typeof object !== 'string')
      throw new Error(`Expected a string at: ${path.join('.')}, got ${object}`);

    return object;
  }
  if (s.isConstStringType(schema)) {
    if (typeof object !== 'string')
      throw new Error(`Expected a string at: ${path.join('.')}`);
    if (object !== schema[s.internal].definition.value)
      throw new Error(
        `Expected a string at: ${path.join('.')}, got ${object}, received ${schema[s.internal].definition.value}`,
      );

    return object;
  }
  if (s.isNumberType(schema)) {
    if (typeof object !== 'number')
      throw new Error(`Expected a number at: ${path.join('.')}`);

    return object;
  }
  if (s.isIntegerType(schema)) {
    if (typeof object !== 'number')
      throw new Error(`Expected a number at: ${path.join('.')}`);
    if (!Number.isInteger(object))
      throw new Error(`Expected an integer at: ${path.join('.')}`);

    return object;
  }
  if (s.isBooleanType(schema)) {
    if (typeof object !== 'boolean')
      throw new Error(`Expected a boolean at: ${path.join('.')}`);

    return object;
  }
  if (s.isNullType(schema)) {
    if (object !== null)
      throw new Error(`Expected a null at: ${path.join('.')}`);

    return object;
  }
  if (s.isObjectType(schema)) {
    if (typeof object !== 'object' || object === null)
      throw new Error(`Expected an object at: ${path.join('.')}`);
    const { shape } = schema[s.internal].definition;

    Object.entries(shape).every(([key, child]) =>
      parseJsonSchema(child, object[key as keyof typeof object], [
        ...path,
        key,
      ]),
    );

    return object;
  }
  if (s.isArrayType(schema)) {
    if (!Array.isArray(object))
      throw new Error(`Expected an array at: ${path.join('.')}`);

    object.every((item) =>
      parseJsonSchema(schema[s.internal].definition.element, item),
    );

    return object;
  }
  if (s.isAnyOfType(schema)) {
    const isValid = schema[s.internal].definition.options.some((option) => {
      try {
        parseJsonSchema(option, object, [...path, 'anyOf']);
        return true;
      } catch {
        return false;
      }
    });

    if (!isValid) {
      throw new Error(`No matching schema found at: ${path.join('.')}`);
    }

    return object;
  }

  if (s.isEnumType(schema)) {
    if (typeof object !== 'string')
      throw new Error(`Expected a string at: ${path.join('.')}`);
    if (!schema[s.internal].definition.entries.includes(object))
      throw new Error(`Expected an enum value at: ${path.join('.')}`);

    return object;
  }

  throw new Error(`Unhandled schema type at: ${path.join('.')}`);
}

export function validateJsonSchema<T extends s.HashbrownType>(
  schema: T,
  object: unknown,
): void {
  // No return.  Just see if it throws an exception.
  parseJsonSchema(schema, object);
}
