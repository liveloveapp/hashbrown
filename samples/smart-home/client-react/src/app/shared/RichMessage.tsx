import { UiChat } from '@hashbrownai/react';

export const RichMessage = ({ message }: { message: UiChat.Message }) => {
  console.log(message);
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';
  const isTool = message.role === 'tool';

  if (false) {
    return (
      <div className="flex w-full justify-end">
        <div className="p-2 rounded-md bg-secondary/80 text-secondary-foreground">
          {JSON.stringify(message)}
        </div>
      </div>
    );
  }

  if (isSystem || isTool || (isAssistant && !message.content)) {
    return null;
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
        <div className="flex flex-col gap-2">{message.content}</div>
      </div>
    </div>
  );
};
