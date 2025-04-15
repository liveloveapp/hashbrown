import { Chat, useChat } from '@hashbrownai/react';
import { useState } from 'react';
import { Button } from './button';
import { Message } from './Message';
import { Textarea } from './textarea';

export const ChatPanel = () => {
  const { messages, sendMessage } = useChat();

  // Add state for the textarea input
  const [inputValue, setInputValue] = useState('');

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
      onSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col border-b">
        <p className="text-lg font-bold">Assistant Chat</p>
      </div>
      <div className="flex flex-col gap-2 py-2">
        {messages.map((message, index) => (
          <Message key={index} message={message} />
        ))}
      </div>
      <Textarea
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your message..."
      />
      <Button onClick={onSubmit}>Send</Button>
    </div>
  );
};
