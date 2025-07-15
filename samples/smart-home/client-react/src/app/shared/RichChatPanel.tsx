import { Chat, s } from '@hashbrownai/core';
import {
  exposeComponent,
  useRuntime,
  useRuntimeFunction,
  useTool,
  useToolJavaScript,
  useUiChat,
} from '@hashbrownai/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSmartHomeStore } from '../store/smart-home.store';
import { LightChatComponent } from '../views/components/LightChatComponent';
import { Button } from './button';
import { CardComponent } from './CardComponent';
import { MarkdownComponent } from './MarkdownComponent';
import { RichMessage } from './RichMessage';
import { ScrollArea } from './scrollarea';
import { Textarea } from './textarea';
import { Light } from '../models/light.model';

export const RichChatPanel = () => {
  const getLights = useTool({
    name: 'getLights',
    description: 'Get the current lights',
    handler: () => Promise.resolve(useSmartHomeStore.getState().lights),
    deps: [],
  });
  const controlLight = useTool({
    name: 'controlLight',
    description: 'Control the light. Brightness is a number between 0 and 100.',
    schema: s.object('Control light input', {
      lightId: s.string('The id of the light'),
      brightness: s.number('The brightness of the light, between 0 and 100'),
    }),
    handler: (input) => {
      const { lightId, brightness } = input;

      useSmartHomeStore.getState().updateLight(lightId, {
        brightness,
      });

      return Promise.resolve(true);
    },
    deps: [],
  });
  const createLight = useRuntimeFunction({
    name: 'createLight',
    description: 'Create a new light',
    args: s.object('Create light input', {
      name: s.string('The name of the light'),
    }),
    result: s.object('Create light result', {
      lightId: s.string('The id of the light'),
    }),
    deps: [],
    handler: (input) => {
      const { name } = input;
      const light: Light = {
        id: crypto.randomUUID(),
        name,
        brightness: 0,
      };

      useSmartHomeStore.getState().addLight(light);

      return Promise.resolve({ lightId: light.id });
    },
  });
  const runtime = useRuntime({
    functions: [createLight],
  });
  const toolJavaScript = useToolJavaScript({
    runtime,
  });

  const {
    messages,
    sendMessage,
    resendMessages,
    isSending,
    isReceiving,
    isRunningToolCalls,
    stop,
  } = useUiChat({
    model: 'gpt-4.1',
    debugName: 'RichChatPanel',
    system: `
      You are a smart home assistant. You can control the lights in the house. 
      You should not stringify (aka escape) function arguments

      Always prefer writing a single script for the javascript tool over calling 
      the javascript tool multiple times.
    `,
    tools: [getLights, controlLight, toolJavaScript],
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
          content: s.streaming.string('The content of the markdown'),
        },
      }),
      exposeComponent(CardComponent, {
        name: 'CardComponent',
        description: 'Show a card with children components to the user',
        children: 'any',
        props: {
          title: s.string('The title of the card'),
          description: s.streaming.string('The description of the card'),
        },
      }),
    ],
  });

  const isWorking = useMemo(() => {
    return isSending || isReceiving || isRunningToolCalls;
  }, [isSending, isReceiving, isRunningToolCalls]);

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

  // useEffect(() => {
  //   console.log(messages);
  // }, [messages]);

  const onSubmit = useCallback(() => {
    // Only submit if there's text
    if (!inputValue.trim()) return;

    // Add the user message to the messages list
    const newUserMessage: Chat.UserMessage = {
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
        onSubmit();
      }
    },
    [onSubmit],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
    },
    [],
  );

  const onRetry = useCallback(() => {
    resendMessages();
  }, [resendMessages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col flex-1 min-h-0">
        <ScrollArea className="flex-1" ref={scrollAreaRef}>
          <div className="flex flex-col gap-2 px-2">
            {messages.map((message, index, array) => (
              <RichMessage
                key={index}
                message={message}
                onRetry={onRetry}
                isLast={index === array.length - 1}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
      <div className="flex flex-col text-sm text-foreground/50 gap-2 h-6 justify-end px-2">
        {isWorking && <p>Thinking...</p>}
      </div>
      <div className="flex flex-col gap-2 px-2">
        <Textarea
          value={inputValue}
          onChange={onInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
        />
        {!isWorking ? (
          <Button onClick={onSubmit}>Send</Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              stop();
            }}
          >
            Stop
          </Button>
        )}
      </div>
    </div>
  );
};
