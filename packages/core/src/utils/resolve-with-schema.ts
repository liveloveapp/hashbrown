import { s } from '../schema';
import {
  createParserState,
  finalizeJsonParse,
  parseChunk,
} from '../skillet/parser/json-parser';
import { JsonValue } from './types';

export function resolveWithSchema(
  schema: s.HashbrownType,
  input: string,
): JsonValue | undefined {
  const state = finalizeJsonParse(parseChunk(createParserState(), input));
  const output = s.fromJsonAst(schema, state);
  if (output.result.state !== 'match') {
    return undefined;
  }

  return output.result.value as JsonValue;
}
