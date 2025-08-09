```ts
import { useToolJavaScript } from '@hashbrownai/react';

const useChartTool = () => {
  const runtime = useChartRuntime();

  return useToolJavaScript({
    runtime,
  });
};
```
