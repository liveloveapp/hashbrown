import { Chat, s } from '@hashbrownai/core';
import {
  createTool,
  createToolWithArgs,
  exposeComponent,
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

export const RichChatPanel = () => {
  const {
    messages,
    sendMessage,
    resendMessages,
    isSending,
    isReceiving,
    isRunningToolCalls,
  } = useUiChat({
    model: 'palmyra-x5',
    // model: 'gpt-4o',
    system: `You are a smart home assistant. You can control the lights in the house. You should not stringify (aka escape) function arguments.
      
          You should not double-escape (in the JSON meaning) function arguments.

      If a user refers to a light by name, the light ID can be found by getting the 
      list of light entities and finding the light ID for the given name.

      For example, the light named "Office Light" would match the entity:
      {
        brightness: 100,
        id: "16fece1a-3038-4394-83e3-ddac09fe4b66",
        name: "Test 2"
      }

      So, the lightId property would be the entity's 'id' value (in this case "16fece1a-3038-4394-83e3-ddac09fe4b66").

      Similarly, if a user refers to a scene by name, the scene ID can be found by getting the 
      list of scene entities and finding the scene ID for the given name.

      Response schema will be in JSONSchema format, but don't include bits of schema in the response.

      For example, if the request format looks like this:
      {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {
            "ui": {
                "type": "array",
                "items": {
                    "$ref": "#/$defs/anyOf"
                },
                "description": "List of elements"
            }
        },
        "required": [
            "ui"
        ],
        "additionalProperties": false,
        "description": "UI",
        "$defs": {
            "anyOf": {
                "anyOf": [
                    {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                            "1"
                        ],
                        "properties": {
                            "1": {
                                "type": "object",
                                "properties": {
                                    "$tagName": {
                                        "type": "string",
                                        "const": "app-light",
                                        "description": "app-light"
                                    },
                                    "$props": {
                                        "type": "object",
                                        "properties": {
                                            "lightId": {
                                                "type": "string",
                                                "description": "The id of the light"
                                            },
                                            "icon": {
                                                "type": "string",
                                                "enum": [
                                                    "floor_lamp",
                                                    "table_lamp",
                                                    "wall_lamp",
                                                    "lightbulb"
                                                ]
                                            }
                                        },
                                        "required": [
                                            "lightId",
                                            "icon"
                                        ],
                                        "additionalProperties": false,
                                        "description": "Props"
                                    }
                                },
                                "required": [
                                    "$tagName",
                                    "$props"
                                ],
                                "additionalProperties": false,
                                "description": "This option shows a light to the user, with a dimmer for them to control the light.\n          Always prefer this option over printing a light's name. Always prefer putting these in a list.\n        \n          "
                            }
                        }
                    }
                ]
            }
        }
    }

    Then, the response could look like this:
    {
      "ui":[
        {
          "1":{
            "$props":{
              "icon":"lightbulb",
              "lightId":"16fece1a-3038-4394-83e3-ddac09fe4b66"
            },
            "$tagName":"app-light"
          }
        }
      ]
    }`,
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
