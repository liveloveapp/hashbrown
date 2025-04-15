import { useState } from 'react';
import { Textarea } from './textarea';

import {
  ChatCompletionChunk,
  streamChatCompletionWithTools,
} from '@hashbrownai/react';
import { Button } from './button';

export const PredictiveTextArea = () => {
  const [message, setMessage] = useState('');

  const onChunk = (chunk: ChatCompletionChunk) => {
    console.log(chunk);
  };

  const onComplete = () => {
    console.log('complete');
  };

  const onError = (error: Error) => {
    console.error(error);
  };

  const wat = streamChatCompletionWithTools({
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

  console.log('wat', wat);

  console.log('blocked?');

  return (
    <div className="flex">
      <Textarea />
      <Button variant="icon">Send</Button>
    </div>
  );
};
