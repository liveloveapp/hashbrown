/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AnyOfType,
  ArrayType,
  BooleanType,
  ConstStringType,
  EnumType,
  HashbrownType,
  IntegerType,
  NumberType,
  ObjectType,
  StringType,
} from './base';
import { CleanInterfaceShape } from '../../utils/types';

export function string(description: string): StringType {
  return new StringType({ type: 'string', description, streaming: true });
}

export function constString<T extends string>(value: T): ConstStringType<T> {
  return new ConstStringType({
    type: 'const-string',
    description: `${value}`,
    value,
    streaming: true,
  }) as any;
}

export function number(description: string) {
  return new NumberType({ type: 'number', description, streaming: true });
}

export function boolean(description: string) {
  return new BooleanType({ type: 'boolean', description, streaming: true });
}

export function integer(description: string) {
  return new IntegerType({ type: 'integer', description, streaming: true });
}

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

export function enumType<Entries extends string[]>(
  description: string,
  entries: Entries,
) {
  return new EnumType({ type: 'enum', description, entries, streaming: true });
}

export function anyOf<const Options extends readonly HashbrownType[]>(
  description: string,
  options: Options,
): AnyOfType<Options> {
  return new AnyOfType({
    type: 'any-of',
    description,
    options,
    streaming: true,
  }) as any;
}
