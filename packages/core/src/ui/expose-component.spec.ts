import { s } from '../schema';
import { createComponentSchema } from './expose-component';

test('createComponentSchema accepts Standard JSON Schema props', () => {
  const standardSchema = {
    '~standard': {
      version: 1,
      vendor: 'test',
      jsonSchema: {
        input: () => ({ type: 'string' }),
        output: () => ({ type: 'string' }),
      },
    },
  } as const satisfies s.StandardJSONSchemaV1<string, string>;

  const component = {
    component: {},
    name: 'city',
    description: 'City component',
    props: {
      value: standardSchema,
    },
  };

  const schema = createComponentSchema([component]);

  expect(() =>
    schema.validate({ city: { props: { value: 'LA' } } }),
  ).not.toThrow();
  expect(() => schema.validate({ city: { props: { value: 123 } } })).toThrow();
});
