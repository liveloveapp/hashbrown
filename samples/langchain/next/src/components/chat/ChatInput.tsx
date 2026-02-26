import { useState } from 'react';
import { Button } from '../button';
import { Textarea } from '../textarea';

interface ChatInputProps {
  placeholder?: string;
  initialValue?: string;
  onSubmit?: (value: string) => void;
  isRunning?: boolean;
  onStop?: () => void;
}

function ChatInput({
  placeholder,
  initialValue = '',
  onSubmit,
  isRunning = false,
  onStop,
}: ChatInputProps) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = () => {
    if (!isRunning && value.trim() && onSubmit) {
      onSubmit(value);
      setValue('');
    }
  };

  const handleStop = () => {
    if (onStop) {
      onStop();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isRunning) {
        handleSubmit();
      }
    }
  };

  return (
    <>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      <Button onClick={isRunning ? handleStop : handleSubmit}>
        {isRunning ? 'Stop' : 'Submit'}
      </Button>
    </>
  );
}

ChatInput.displayName = 'ChatInput';

export default ChatInput;
