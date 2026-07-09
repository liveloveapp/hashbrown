import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { prompt, s } from '@hashbrownai/core';
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

test('useUiKit compiles examples into the wrapper schema description', () => {
  // Arrange
  const Button = ({ label }: { label: string }) =>
    createElement('button', null, label);

  const examples = prompt`<ui><Button label="Save" /></ui>`;

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
      examples,
    }),
  );

  // Act
  const jsonSchema = s.toJsonSchema(result.current.schema);

  // Assert
  expect(jsonSchema.description ?? '').toContain('"label": "Save"');
});
