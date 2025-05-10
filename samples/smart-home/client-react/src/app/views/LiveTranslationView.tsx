import { s } from '@hashbrownai/core';
import { useStructuredCompletion } from '@hashbrownai/react';
import { useMemo, useRef, useState } from 'react';
import { Input } from '../shared/input';
import { MarkdownComponent } from '../shared/MarkdownComponent';

export const LiveTranslationView = () => {
  const [input, setInput] = useState('');

  // Return spanish, french, and german with a structured response:
  /*
  {
    spanish: string;
    french: string;
    german: string;
  }
  */
  const chat = useStructuredCompletion({
    model: 'gpt-4o',
    output: s.object('Your response', {
      translations: s.object('The translations', {
        spanish: s.string('The spanish translation'),
        french: s.string('The french translation'),
        german: s.string('The german translation'),
      }),
    }),
    input: input,
    system:
      'You are a translator. You will translate the following text to spanish, french, and german.',
  });

  type Translations = {
    spanish: string;
    french: string;
    german: string;
  };

  const prevTranslationsRef = useRef<Translations | undefined>(undefined);

  const latestMessage = useMemo(() => {
    return chat.messages[chat.messages.length - 1];
  }, [chat.messages]);

  const latestAssistantMessage = useMemo(() => {
    const message = latestMessage;
    if (message?.role === 'assistant' && message.content) {
      return message;
    }
    return undefined;
  }, [latestMessage]);

  const content = useMemo<Translations | undefined>(() => {
    const lastMessage = chat.messages[chat.messages.length - 1];
    if (lastMessage?.content?.translations) {
      const newTranslations = lastMessage.content.translations as Translations;
      prevTranslationsRef.current = newTranslations;
      return newTranslations;
    }
    return prevTranslationsRef.current;
  }, [chat.messages]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Enter text to translate"
      />
      {content &&
        Object.entries(content).map(([key, value]) => (
          <div key={key}>
            {key}: {value}
          </div>
        ))}
      {latestAssistantMessage && (
        <MarkdownComponent
          content={`\`\`\`json\n${JSON.stringify(
            latestAssistantMessage.content,
            null,
            2,
          )}\n\`\`\``}
        />
      )}
    </div>
  );
};
