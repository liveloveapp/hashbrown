import { devActions } from '../actions';
import { s } from '../schema';
import { reducer } from './tools.reducer';

const standardToolSchema = {
  '~standard': {
    version: 1,
    vendor: 'test',
    jsonSchema: {
      input: () => ({
        type: 'object',
        properties: {
          city: { type: 'string' },
        },
        required: ['city'],
        additionalProperties: false,
      }),
      output: () => ({ type: 'string' }),
    },
  },
} as const satisfies s.StandardJSONSchemaV1<{ city: string }, string>;

test('normalizes Standard JSON Schema tool inputs into Hashbrown schemas', () => {
  const state = reducer(
    undefined,
    devActions.init({
      model: 'test',
      system: 'test',
      tools: [
        {
          name: 'weather',
          description: 'Weather tool',
          schema: standardToolSchema,
          handler: async () => undefined,
        },
      ],
    }),
  );

  const tool = state.entities['weather'];
  expect(tool).toBeDefined();
  expect(s.isHashbrownType(tool.schema)).toBe(true);

  const schema = tool.schema as s.HashbrownType;
  expect(() => schema.validate({ city: 'LA' })).not.toThrow();
  expect(() => schema.validate({})).toThrow();
});
