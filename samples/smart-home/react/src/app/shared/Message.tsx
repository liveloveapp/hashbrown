import { Chat } from '@hashbrownai/core';

export const Message = ({
  message,
}: {
  message: Chat.Message<string, Chat.AnyTool>;
}) => {
  const isAssistant = message.role === 'assistant';

  if (isAssistant && !message.content) {
    return;
  }

  return (
    <div
      className={`flex w-full ${isAssistant ? 'justify-start' : 'justify-end'}`}
    >
      <div
        className={`p-2 rounded-md ${
          isAssistant
            ? 'bg-secondary/80 text-secondary-foreground'
            : 'bg-primary/80 text-primary-foreground'
        }`}
      >
        {typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content)}
      </div>
    </div>
  );
};
