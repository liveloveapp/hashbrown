import { Textarea } from './textarea';

import { streamChatCompletionWithTools } from '@hashbrownai/react';

export const PredictiveTextArea = () => {
  const onChunk = (chunk: ChatCompletionChunk) => {
    console.log(chunk);
  };

  const onComplete = () => {
    console.log('complete');
  };

  const onError = (error: Error) => {
    console.error(error);
  };

  streamChatCompletionWithTools({
    url: 'http://localhost:3000/chat',
    request: {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello, world!' }],
    },
    callbacks: {
      onChunk,
      onComplete,
      onError,
    },
  });

  return <Textarea />;
};
