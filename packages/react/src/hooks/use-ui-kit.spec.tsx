import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import {
  createUiJsonSchema,
  s,
  type UiComponentDefinition,
} from '@hashbrownai/core';
import { exposeComponent } from '../expose-component.fn';
import { useUiKit } from './use-ui-kit';

test('useUiKit renders resolved UI values', () => {
  const Button = ({ label }: { label: string }) =>
    createElement('button', null, label);

  const { result } = renderHook(() =>
    useUiKit({
      components: [
        exposeComponent(Button, {
          name: 'Button',
          description: 'button',
          props: {
            label: s.string('label'),
          },
        }),
      ],
    }),
  );

  const uiValue = {
    ui: [
      {
        Button: {
          props: {
            complete: true,
            partialValue: { label: 'Hello' },
            value: { label: 'Hello' },
          },
        },
      },
    ],
  };

  const rendered = result.current.render(uiValue);

  expect(rendered).toHaveLength(1);
});

test('useUiKit throws when UI does not match the schema', () => {
  const Button = ({ label }: { label: string }) =>
    createElement('button', null, label);

  const { result } = renderHook(() =>
    useUiKit({
      components: [
        exposeComponent(Button, {
          name: 'Button',
          description: 'button',
          props: {
            label: s.string('label'),
          },
        }),
      ],
    }),
  );

  const uiValue = {
    ui: [
      {
        Unknown: {
          props: {
            complete: true,
            partialValue: { label: 'Hello' },
            value: { label: 'Hello' },
          },
        },
      },
    ],
  };

  expect(() => result.current.render(uiValue)).toThrow();
});

test('useUiKit describes the wrapper schema without examples', () => {
  // Arrange
  const Button = ({ label }: { label: string }) =>
    createElement('button', null, label);

  const { result } = renderHook(() =>
    useUiKit({
      components: [
        exposeComponent(Button, {
          name: 'Button',
          description: 'button',
          props: {
            label: s.string('label'),
          },
        }),
      ],
    }),
  );

  // Act
  const jsonSchema = s.toJsonSchema(result.current.schema);

  // Assert
  expect(jsonSchema.description).toBe(
    'Return a JSON object with a single key "ui" that matches the schema below. Use only these components.',
  );
  expect('examples' in result.current).toBe(false);
});

test('useUiKit and createUiJsonSchema agree when they share component definitions', () => {
  const metric = {
    name: 'metric',
    description: 'A KPI metric card',
    props: {
      label: s.string('The metric label'),
      value: s.number('The metric value'),
    },
  } satisfies UiComponentDefinition;
  const Metric = ({ label, value }: { label: string; value: number }) =>
    createElement('div', null, label, value);
  const { result } = renderHook(() =>
    useUiKit({ components: [exposeComponent(Metric, metric)] }),
  );

  const schema = createUiJsonSchema({ components: [metric] });

  expect(schema).toEqual(JSON.parse(result.current.serializedSchema));
});
