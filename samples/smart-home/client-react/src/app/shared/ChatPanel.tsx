import { Chat, s } from '@hashbrownai/core';
import { useChat, useTool } from '@hashbrownai/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSmartHomeStore } from '../store/smart-home.store';
import { Button } from './button';
import { Message } from './Message';
import { ScrollArea } from './scrollarea';
import { Textarea } from './textarea';

export const ChatPanel = () => {
  const getLights = useTool(
    {
      name: 'getLights',
      description: 'Get the current lights',
      handler: () => Promise.resolve(useSmartHomeStore.getState().lights),
    },
    [],
  );
  const controlLight = useTool(
    {
      name: 'controlLight',
      description:
        'Control the light. Brightness is a number between 0 and 100.',
      schema: s.object('Control light input', {
        lightId: s.string('The id of the light'),
        brightness: s.number('The brightness of the light, between 0 and 100'),
      }),
      handler: (input) => {
        useSmartHomeStore.getState().updateLight(input.lightId, {
          brightness: input.brightness,
        });
        return Promise.resolve(true);
      },
    },
    [],
  );
  const { messages, sendMessage, isSending, isReceiving, isRunningToolCalls } =
    useChat({
      model: 'gpt-4o-mini',
      system:
        'You are a helpful assistant that can answer questions and help with tasks.',
      tools: [getLights, controlLight],
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

  const onSubmit = () => {
    // Only submit if there's text
    if (!inputValue.trim()) return;

    // Add the user message to the messages list
    const newUserMessage: Chat.UserMessage = {
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
      if (isWorking) {
        // stop();
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
              <Message key={index} message={message} />
            ))}
          </div>
        </ScrollArea>
      </div>
      <div className="flex flex-col text-sm text-foreground/50 gap-2 h-6 justify-end">
        {isWorking && <p>Thinking...</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
        />
        {!isWorking ? (
          <Button onClick={onSubmit}>Send</Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              console.log('stop');
            }}
          >
            Stop
          </Button>
        )}
      </div>
    </div>
  );
};
