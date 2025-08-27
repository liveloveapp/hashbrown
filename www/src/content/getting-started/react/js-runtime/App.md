```tsx
import { useChat, exposeComponent, s } from '@hashbrownai/react';

export function App() {
  const chartTool = useChartTool();

  const { messages, sendMessage, lastAssistantMessage, isSending, isReceiving } = useChat({
    model: 'gpt-5',
    system: 'Build an interactive chart using chart.js',
    tools: [chartTool],
  });

  return (
    <div>
      {(isSending || isReceiving) && <Loader />}
      {lastAssistantMessage && <RenderMessage message={lastAssistantMessage} />}
    </div>
  );
}
```
