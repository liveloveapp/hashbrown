import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { s } from '@hashbrownai/core';
import { exposeComponent } from '../expose-component.fn';
import { useImperativeJsonParser } from './use-imperative-json-parser';
import { useUiKit } from './use-ui-kit';

test('ui kit json parser interaction renders complex ui without errors', () => {
  // Arrange
  const Card = ({ title, children }: { title: string; children?: ReactNode }) =>
    createElement('section', null, title, children);
  const Paragraph = ({
    tone,
    children,
  }: {
    tone: string;
    children?: ReactNode;
  }) => createElement('p', null, tone, children);
  const Button = ({ label }: { label: string }) =>
    createElement('button', null, label);
  const OrderedList = ({ children }: { children?: ReactNode }) =>
    createElement('ol', null, children);
  const ListItem = ({ children }: { children?: ReactNode }) =>
    createElement('li', null, children);
  const UnorderedList = ({ children }: { children?: ReactNode }) =>
    createElement('ul', null, children);

  const components = [
    exposeComponent(Card, {
      name: 'Card',
      description: 'Card with nested content',
      children: 'any',
      props: {
        title: s.string('Card title'),
      },
    }),
    exposeComponent(Paragraph, {
      name: 'Paragraph',
      description: 'Paragraph with text children',
      children: 'text',
      props: {
        tone: s.string('Paragraph tone'),
      },
    }),
    exposeComponent(Button, {
      name: 'Button',
      description: 'Button with label',
      props: {
        label: s.string('Button label'),
      },
    }),
    exposeComponent(OrderedList, {
      name: 'OrderedList',
      description: 'Ordered list with items',
      children: [
        exposeComponent(ListItem, {
          name: 'ListItem',
          description: 'List item with children',
          children: 'any',
        }),
      ],
    }),
    exposeComponent(UnorderedList, {
      name: 'UnorderedList',
      description: 'Unordered list with items',
      children: [
        exposeComponent(ListItem, {
          name: 'ListItem',
          description: 'List item with children',
          children: 'any',
        }),
      ],
    }),
  ];

  const useUiKitParser = () => {
    const uiKit = useUiKit({ components });
    const parser = useImperativeJsonParser(uiKit.schema);
    const rendered = uiKit.render(parser.value ?? { ui: [] });
    return { parser, rendered };
  };

  const payload = {
    ui: [
      {
        Card: {
          props: { title: 'Welcome' },
          children: [
            {
              Paragraph: {
                props: { tone: 'info' },
                children: 'Hello there.',
              },
            },
            {
              Button: {
                props: { label: 'Continue' },
              },
            },
            {
              OrderedList: {
                children: [
                  {
                    ListItem: { children: 'Item 1' },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  };
  const json = JSON.stringify(payload);
  const chunks = json.split('');

  const { result } = renderHook(() => useUiKitParser());

  // Act
  chunks.forEach((chunk) => {
    act(() => {
      result.current.parser.parseChunk(chunk);
    });
  });

  const rendered = result.current.rendered;

  // Assert
  expect(result.current.parser.error).toBeUndefined();
  expect(rendered).toHaveLength(1);
  expect(rendered[0]?.type).toBe(Card);
  expect(rendered[0]?.props.title).toBe('Welcome');

  const cardChildren = rendered[0]?.props.children as any[];
  expect(cardChildren).toHaveLength(2);
  expect(cardChildren[0]?.type).toBe(Paragraph);
  expect(cardChildren[0]?.props.tone).toBe('info');
  expect(cardChildren[0]?.props.children).toBe('Hello there.');
  expect(cardChildren[1]?.type).toBe(Button);
  expect(cardChildren[1]?.props.label).toBe('Continue');
});
