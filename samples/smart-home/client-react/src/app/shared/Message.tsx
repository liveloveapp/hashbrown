import { Chat } from '@hashbrownai/react';

export const Message = ({ message }: { message: Chat.Message }) => {
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';
  const isTool = message.role === 'tool';
  const isError = message.role === 'error';

  const onLeft = isAssistant || isError;

  if (isSystem || isTool || ((isAssistant || isError) && !message.content)) {
    return;
  }

  let classNames = '';

  if (isAssistant) {
    classNames = 'bg-secondary/80 text-secondary-foreground';
  } else if (isError) {
    classNames = 'bg-error/80 text-secondary-foreground';
  } else {
    classNames = 'bg-primary/80 text-primary-foreground';
  }

  return (
    <div className={`flex w-full ${onLeft ? 'justify-start' : 'justify-end'}`}>
      <div className={`p-2 rounded-md ${classNames}`}>
        {typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content)}
      </div>
    </div>
  );
};
