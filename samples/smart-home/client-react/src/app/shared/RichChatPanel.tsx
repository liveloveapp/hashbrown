import { Chat, exposeComponent, s } from '@hashbrownai/core';
import {
  ChatStatus,
  createTool,
  createToolWithArgs,
  useUiChat,
} from '@hashbrownai/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSmartHomeStore } from '../store/smart-home.store';
import { LightChatComponent } from '../views/components/LightChatComponent';
import { Button } from './button';
import { CardComponent } from './CardComponent';
import { MarkdownComponent } from './MarkdownComponent';
import { RichMessage } from './RichMessage';
import { ScrollArea } from './scrollarea';
import { Textarea } from './textarea';

export const RichChatPanel = () => {
  const { messages, sendMessage, status, stop } = useUiChat({
    model: 'gpt-4o-mini',
    tools: [
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: () => Promise.resolve(useSmartHomeStore.getState().lights),
      }),
      createToolWithArgs({
        name: 'controlLight',
        description:
          'Control the light. Brightness is a number between 0 and 100.',
        schema: s.object('Control light input', {
          lightId: s.string('The id of the light'),
          brightness: s.number(
            'The brightness of the light, between 0 and 100',
          ),
        }) as unknown as s.ObjectType<Record<string, s.HashbrownType<unknown>>>,
        handler: (input: object) => {
          const { lightId, brightness } = input as {
            lightId: string;
            brightness: number;
          };
          useSmartHomeStore.getState().updateLight(lightId, {
            brightness,
          });
          return Promise.resolve(true);
        },
      }),
    ],
    components: [
      exposeComponent(LightChatComponent, {
        name: 'LightChatComponent',
        description: 'A component that lets the user control a light',
        props: {
          lightId: s.string('The id of the light'),
        },
      }),
      exposeComponent(MarkdownComponent, {
        name: 'MarkdownComponent',
        description: 'Show markdown content to the user',
        props: {
          content: s.string('The content of the markdown'),
        },
      }),
      exposeComponent(CardComponent, {
        name: 'CardComponent',
        description: 'Show a card with children components to the user',
        children: 'any',
        props: {
          title: s.string('The title of the card'),
          description: s.string('The description of the card'),
        },
      }),
    ],
  });

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Add state for the textarea input
  const [inputValue, setInputValue] = useState('');

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        '[data-radix-scroll-area-viewport]',
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  useEffect(() => {
    console.log(messages);
  }, [messages]);

  const onSubmit = useCallback(() => {
    // Only submit if there's text
    if (!inputValue.trim()) return;

    // Add the user message to the messages list
    const newUserMessage: Chat.Message = {
      role: 'user',
      content: inputValue,
    };

    setInputValue('');

    sendMessage(newUserMessage);
  }, [inputValue, sendMessage, setInputValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Enter (but not on Shift+Enter)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent default behavior (new line)
        if (status !== ChatStatus.Idle) {
          stop();
        } else {
          onSubmit();
        }
      }
    },
    [onSubmit, status, stop],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
    },
    [],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col flex-1 min-h-0">
        <ScrollArea className="flex-1" ref={scrollAreaRef}>
          <div className="flex flex-col gap-2 px-2">
            {messages.map((message, index) => (
              <RichMessage key={index} message={message} />
            ))}
          </div>
        </ScrollArea>
      </div>
      <div className="flex flex-col text-sm text-foreground/50 gap-2 h-6 justify-end px-2">
        {status !== ChatStatus.Idle && <p>Thinking...</p>}
      </div>
      <div className="flex flex-col gap-2 px-2">
        <Textarea
          value={inputValue}
          onChange={onInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
        />
        {status === ChatStatus.Idle ? (
          <Button onClick={onSubmit}>Send</Button>
        ) : (
          <Button variant="outline" onClick={stop}>
            Stop
          </Button>
        )}
      </div>
    </div>
  );
};
