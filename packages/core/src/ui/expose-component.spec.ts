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

  const validateGood = () =>
    schema.validate({ city: { props: { value: 'LA' } } });
  const validateBad = () =>
    schema.validate({ city: { props: { value: 123 } } });

  expect(validateGood).not.toThrow();
  expect(validateBad).toThrow();
});

test('createComponentSchema accepts node-wrapped props values', () => {
  const component = {
    component: {},
    name: 'city',
    description: 'City component',
    props: {
      value: s.string('value'),
    },
  };
  const value = {
    city: {
      props: {
        complete: true,
        partialValue: { value: 'LA' },
        value: { value: 'LA' },
      },
    },
  };

  const schema = createComponentSchema([component]);

  const validate = () => schema.validate(value);

  expect(validate).not.toThrow();
});
