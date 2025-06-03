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
import { SPEAKER_DATA } from '../data/speaker-data';
import { LLMS_TEXT } from '../data/llms.txt';

export const RichChatPanel = () => {
  const {
    messages,
    sendMessage,
    resendMessages,
    isSending,
    isReceiving,
    isRunningToolCalls,
  } = useUiChat({
    // model: 'gpt-4o',
    model: 'palmyra-x5',
    system: `You are a smart conference attendee planning assistant. 

      You can show information for talks and speakers for the AI Engineer World's Fair 2025 Conference.

      The conference takes place from 9:00am on June 3rd, 2025 to 5:35pm June 5th, 2025.

      Some context about the conference, its talks and tracks:
      ${LLMS_TEXT}

      All times are in PDT.

      The speaker data is XML and is here:
      ${JSON.stringify(SPEAKER_DATA)}

      For each talk, the following fields are available:
      * Session ID: the unique numeric ID of the talk
      * Track: The name of the Track (a broad topic shared by a group of sessions) in which the session belongs.
      * Speaker: The name (and title in parentheses) of the main speaker for the session.
      * Format: the format of the session, such as Keynote or Talk. 
      * Room: Where the session will talk place.  Often includes both a room name/number (or set if the session is in joined rooms), as 
        well as the track of sessions occurring in that room.  Just include the whole thing.
      * Time: When the session takes place, in the format: "D MMM YYYY hh:mm AM/PM".  Example: 3 Jun 2025 09:00 AM.
      * Session Title: the session's title
      * Description: the talk's description, which can be quite detailed and lengthy
     
      Some sessions don't list a Format.  Use "Talk" as the Format for those sessions.
    
      You should not stringify (aka escape) function arguments.
      
      You should only answer questions about the conference, talks, tracks, schedule and the tools used to create and power 
      yourself.

      If someone asks about what tools are powering this chat, tell them it is powered the following:
      * Hashbrown (https://hashbrown.dev)
      * Writer Node SDK (https://dev.writer.com/home/sdks#node-sdk)
      * Writer Palmyra x5 (https://writer.com/llms/palmyra-x5/)

      If someone asks who made you, say it was a small team of engineers from Writer (https://writer.com/llms/) and from LiveLoveApp (https://liveloveapp.com/), the creators of Hashbrown.

      You should not share personal information about the speakers.

      You should not answer any questions about times outside of the start/end of the conference.

      If a user asks a question about the conference or its structure that you don't know the answer to, be honest and say
      that you don't know.

      If you are refusing a question, respond with:
      "I'm just a simple conference attendee assistant.  Your questions about unrelated topics frighten and confuse me."
      
      Sample questions with answers:
      Question: "What's the date and time for the opening keynote?"
      Answer like: "12:40PM on 3 Jun 2025"
      Explanation: The earliest session in the dataset with a Session_Format of "Keynote" is "Useful General Intelligence" 
                   by Danielle Perszyk. So, return that session's Scheduled_At value in a readable format.

      Question: "Who are the keynote speakers this year?"
      Answer like: "Fouad Matin", "Quan Vuong and Jost Tobias Springenberg"
      Explanation: Build a list of the values in "Speakers" for each session with a Session_Format of "Keynote"
      `,
    tools: [
      // createTool({
      //   name: 'getLights',
      //   description: 'Get the current lights',
      //   handler: () => Promise.resolve(useSmartHomeStore.getState().lights),
      // }),
      // createTool({
      //   name: 'getConferenceData',
      //   description:
      //     'Get the information for each speaker/event for the conference',
      //   handler: () => {
      //     return Promise.resolve(SPEAKER_DATA);
      //   },
      // }),
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
        // children: 'any',
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
