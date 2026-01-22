/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ArrayType,
  HashbrownType,
  ObjectType,
  StringConstraintsInput,
  StringType,
} from './base';
import { CleanInterfaceShape } from '../utils/types';

/**
 * @public
 */
export function string(
  description: string,
  constraints?: StringConstraintsInput,
): StringType {
  const normalized = normalizeStringConstraints(constraints);
  return new StringType({
    type: 'string',
    description,
    streaming: true,
    ...normalized,
  });
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
    streaming: true,
    shape,
  }) as any;
}

function normalizeStringConstraints(constraints?: StringConstraintsInput): {
  pattern?: string;
  format?: StringConstraintsInput['format'];
} {
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
    streaming: true,
    element: item,
    ...constraints,
  }) as any;
}
