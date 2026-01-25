import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { s } from '@hashbrownai/core';
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

  const uiValue = [
    {
      Button: {
        props: {
          complete: true,
          partialValue: { label: 'Hello' },
          value: { label: 'Hello' },
        },
        children: [],
      },
    },
  ];

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

  const uiValue = [
    {
      Unknown: {
        props: {
          complete: true,
          partialValue: { label: 'Hello' },
          value: { label: 'Hello' },
        },
        children: [],
      },
    },
  ];

  expect(() => result.current.render(uiValue)).toThrow();
});
