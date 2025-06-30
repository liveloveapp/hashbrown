```tsx
export const ChatPanel = () => {
  const getLights = useTool({
    name: 'getLights',
    description: 'Get the current lights',
    handler: () => Promise.resolve(useSmartHomeStore.getState().lights),
  });
  const controlLight = useTool({
    name: 'controlLight',
    description: 'Control the light. Brightness is a number between 0 and 100.',
    schema: s.object('Control light input', {
      lightId: s.string('The id of the light'),
      brightness: s.number('The brightness of the light, between 0 and 100'),
    }),
    handler: (input) => {
      useSmartHomeStore.getState().updateLight(input.lightId, {
        brightness: input.brightness,
      });
      return Promise.resolve(true);
    },
  });
  const { messages, sendMessage, status, stop } = useChat({
    model: 'gpt-4o-mini',
    system: 'You are a helpful assistant that can answer questions and help with tasks.',
    tools: [getLights, controlLight],
  });

  return (
    <div>
      {messages.map((message, index) => (
        <Message key={index} message={message} />
      ))}
    </div>
  );
};
```
