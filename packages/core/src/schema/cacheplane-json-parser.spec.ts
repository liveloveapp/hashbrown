import { create, push } from '@cacheplane/partial-json';
import * as publicApi from '../public_api';
import * as s from './public_api';

test('projects Cacheplane stream state through a Skillet schema', () => {
  const schema = s.streaming.object('output', {
    message: s.streaming.string('message'),
  });
  const state = push(create(), '{"message":"hello');

  const output = s.fromJsonAst(schema, state);

  expect(output.result).toEqual({
    state: 'match',
    value: { message: 'hello' },
  });
});

test('does not expose the removed Hashbrown JSON parser API', () => {
  const legacyExports = [
    'createParserState',
    'finalizeJsonParse',
    'getResolvedValue',
    'parseChunk',
  ];

  const exportedLegacyNames = legacyExports.filter((name) => name in publicApi);

  expect(exportedLegacyNames).toEqual([]);
});
