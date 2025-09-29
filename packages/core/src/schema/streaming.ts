/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrayType, HashbrownType, ObjectType, StringType } from './base';
import { CleanInterfaceShape } from '../utils/types';

/**
 * @public
 */
export function string(description: string): StringType {
  return new StringType({ type: 'string', description, streaming: true });
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
    streaming: true,
    element: item,
  }) as any;
}
