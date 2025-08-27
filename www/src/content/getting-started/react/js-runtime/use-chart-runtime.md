```ts
import { useRuntime, useRuntimeFunction } from '@hashbrownai/react';

const useGetData = () => {
  const ingredients = useIngredients();

  return useRuntimeFunction({
    name: 'getData',
    description: 'Synchronously get the data for the chart',
    args: queryIngredientsSchema,
    result: s.array('the ingredients', ingredientSchema),
    deps: [ingredients],
    handler: async (input) => {
      return ingredients.getAll();
    },
  });
};

const useRenderChart = () => {
  const { canvas, setChart } = useChart();

  return useRuntimeFunction({
    name: 'renderChart',
    description: 'Render a chart',
    args: chartSchema,
    deps: [canvas]
    handler: async (args) => {
      const chart = new ChartJS(canvas.current, args.chart);

      setChart(chart);
    },
  });
};

export const useChartRuntime = () => {
  const getData = useGetData();
  const renderChart = useRenderChart();

  return useRuntime({
    functions: [getData, renderChart],
  });
};
```
