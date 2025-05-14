import { UiChatMessage } from '@hashbrownai/react';

export const RichMessage = ({ message }: { message: UiChatMessage<any> }) => {
  const isAssistant = message.role === 'assistant';

  if (isAssistant && !message.content) {
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
        <div className="flex flex-col gap-2">
          {message.role === 'assistant' ? message.ui : message.content}
        </div>
      </div>
    </div>
  );
};
