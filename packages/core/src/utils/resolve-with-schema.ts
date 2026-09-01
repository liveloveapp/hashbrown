import { s } from '../schema';
import { create, finish, push } from '@cacheplane/json-stream';
import { JsonValue } from './types';

export function resolveWithSchema(
  schema: s.HashbrownType,
  input: string,
): JsonValue | undefined {
  const state = finish(push(create(), input));
  const output = s.fromJsonAst(schema, state);
  if (output.result.state !== 'match') {
    return undefined;
  }

  return output.result.value as JsonValue;
}
