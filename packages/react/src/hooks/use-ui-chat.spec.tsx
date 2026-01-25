import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { s, ɵcreateUiKit, ɵisUiKit } from '@hashbrownai/core';
import { vi } from 'vitest';
import { exposeComponent } from '../expose-component.fn';
import { useStructuredChat } from './use-structured-chat';
import { useUiChat } from './use-ui-chat';

vi.mock('./use-structured-chat', () => ({
  useStructuredChat: vi.fn(),
}));

const useStructuredChatMock = vi.mocked(useStructuredChat);

test('useUiChat renders components from UiKit and exposed component inputs', () => {
  // Arrange
  const UiKitButton = ({ label }: { label: string }) =>
    createElement('button', null, label);
  const ExtraButton = ({ label }: { label: string }) =>
    createElement('button', null, label);
  const FallbackButton = ({ label }: { label?: string }) =>
    createElement('span', null, label ?? 'loading');

  const uiKit = ɵcreateUiKit({
    components: [
      exposeComponent(UiKitButton, {
        name: 'UiKitButton',
        description: 'kit button',
        props: {
          label: s.string('label'),
        },
      }),
    ],
  });

  useStructuredChatMock.mockReturnValue({
    messages: [
      {
        role: 'assistant',
        content: {
          ui: [
            {
              UiKitButton: {
                props: {
                  complete: true,
                  partialValue: { label: 'One' },
                  value: { label: 'One' },
                },
                children: [],
              },
            },
            {
              ExtraButton: {
                props: {
                  complete: false,
                  partialValue: { label: 'Loading' },
                },
              },
            },
          ],
        },
        toolCalls: [],
      },
    ],
  } as ReturnType<typeof useStructuredChat>);

  // Act
  const { result } = renderHook(() =>
    useUiChat({
      model: 'gpt-4o-mini',
      system: 'system prompt',
      components: [
        uiKit,
        exposeComponent(ExtraButton, {
          name: 'ExtraButton',
          description: 'extra button',
          props: {
            label: s.string('label'),
          },
          fallback: FallbackButton,
        }),
      ],
    }),
  );

  const ui = result.current.messages[0]?.ui ?? [];

  // Assert
  expect(ui).toHaveLength(2);
  expect(ui[0]?.type).toBe(UiKitButton);
  expect(ui[1]?.type).toBe(FallbackButton);
});

test('useUiChat compiles system prompts with normalized components', () => {
  // Arrange
  const Button = ({ label }: { label: string }) =>
    createElement('button', null, label);

  const uiKit = ɵcreateUiKit({
    components: [
      exposeComponent(Button, {
        name: 'UiKitButton',
        description: 'kit button',
        props: {
          label: s.string('label'),
        },
      }),
    ],
  });

  const systemPrompt = {
    compile: vi.fn(() => 'compiled'),
    examples: [],
    diagnostics: [],
    meta: { uiBlocks: [] },
  };

  useStructuredChatMock.mockReturnValue({
    messages: [],
  } as ReturnType<typeof useStructuredChat>);

  // Act
  renderHook(() =>
    useUiChat({
      model: 'gpt-4o-mini',
      system: systemPrompt,
      components: [uiKit],
    }),
  );

  const [components] = systemPrompt.compile.mock.calls[0] ?? [];
  const hasUIKit = Array.isArray(components)
    ? components.some((entry) => ɵisUiKit(entry))
    : false;

  // Assert
  expect(systemPrompt.compile).toHaveBeenCalledTimes(1);
  expect(hasUIKit).toBe(false);
});
