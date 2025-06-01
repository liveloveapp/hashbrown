import { UiChatMessage } from '@hashbrownai/react';
import { Button } from './button';
import { CircleAlert } from 'lucide-react';

export const RichMessage = ({
  message,
  onRetry,
  isLast,
}: {
  message: UiChatMessage<any>;
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
      <div className={`p-2 rounded-md ${classNames}`}>
        {message.role === 'error' && (
          <div className="flex flex-row items-center gap-2">
            <CircleAlert />
            {message.content}
            {isLast && (
              <Button
                className="!pt-0 !pb-0 h-auto"
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
          <div className="flex flex-col gap-2">{message.content}</div>
        )}
      </div>
    </div>
  );
};
