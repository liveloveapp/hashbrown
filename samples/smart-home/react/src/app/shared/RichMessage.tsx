import { Chat } from '@hashbrownai/core';
import { UiChatMessage } from '@hashbrownai/react';
import { Button } from './button';
import { CircleAlert } from 'lucide-react';

export const RichMessage = ({
  message,
  onRetry,
  isLast,
}: {
  message: UiChatMessage<Chat.AnyTool>;
  onRetry: () => void;
  isLast: boolean;
}) => {
  const isAssistant = message.role === 'assistant';
  const isError = message.role === 'error';

  const onLeft = isAssistant || isError;

  if ((isAssistant || isError) && !message.content) {
    return null;
  }

  let classNames = '';

  if (isAssistant) {
    classNames = 'bg-secondary/80 text-secondary-foreground';
  } else if (isError) {
    classNames = 'bg-destructive/80 text-primary-foreground';
  } else {
    classNames = 'bg-primary/80 text-primary-foreground';
  }

  return (
    <div className={`flex w-full ${onLeft ? 'justify-start' : 'justify-end'}`}>
      <div className={`min-w-0 max-w-full p-2 rounded-md ${classNames}`}>
        {message.role === 'error' && (
          <div className="flex min-w-0 flex-row items-start gap-2">
            <CircleAlert className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
              {message.content}
            </span>
            {isLast && (
              <Button
                className="!pt-0 !pb-0 h-auto shrink-0"
                variant="ghost"
                onClick={onRetry}
              >
                Retry
              </Button>
            )}
          </div>
        )}

        {message.role === 'assistant' && (
          <div className="flex flex-col gap-2">{message.ui}</div>
        )}

        {message.role === 'user' && (
          <div className="flex flex-col gap-2">
            {typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content)}
          </div>
        )}
      </div>
    </div>
  );
};
