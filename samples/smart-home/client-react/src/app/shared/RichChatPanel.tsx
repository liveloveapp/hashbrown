import {
  Chat,
  ChatStatus,
  createTool,
  createToolWithArgs,
  exposeComponent,
  s,
  useUiChat,
} from '@hashbrownai/react';
import { useEffect, useRef, useState } from 'react';
import { useSmartHomeStore } from '../store/smart-home.store';
import { LightChatComponent } from '../views/components/LightChatComponent';
import { Button } from './button';
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
        }),
        handler: (input) => {
          useSmartHomeStore.getState().updateLight(input.lightId, {
            brightness: input.brightness,
          });
          return Promise.resolve(true);
        },
      }),
    ],
    components: [
      exposeComponent(LightChatComponent, {
        name: 'LightChatComponent',
        description: 'A component that lets you configure and control a light.',
        props: {
          lightId: s.string('The id of the light'),
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

  const onSubmit = () => {
    // Only submit if there's text
    if (!inputValue.trim()) return;

    // Add the user message to the messages list
    const newUserMessage: Chat.Message = {
      role: 'user',
      content: inputValue,
    };

    setInputValue('');

    sendMessage(newUserMessage);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (but not on Shift+Enter)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent default behavior (new line)
      if (status !== ChatStatus.Idle) {
        stop();
      } else {
        onSubmit();
      }
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col py-2">
        <ScrollArea className="h-[600px]" ref={scrollAreaRef}>
          <div className="flex flex-col gap-2">
            {messages.map((message, index) => (
              <RichMessage key={index} message={message} />
            ))}
          </div>
        </ScrollArea>
      </div>
      <div className="flex flex-col text-sm text-foreground/50 gap-2 h-6 justify-end">
        {status !== ChatStatus.Idle && <p>Thinking...</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
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
