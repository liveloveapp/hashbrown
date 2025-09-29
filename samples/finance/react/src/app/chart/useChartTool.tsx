import { useState } from 'react';
import { Chat, s } from '@hashbrownai/core';
import {
  useRuntime,
  useRuntimeFunction,
  useToolJavaScript,
} from '@hashbrownai/react';
import { chartSchema } from './schema/chartSchema';
import { ingredientSchema } from './schema/ingredientSchema';
import { queryIngredientsSchema } from './schema/queryIngredientsSchema';
import { fetchIngredients } from './fetchIngredients';

type ChartConfig = s.Infer<typeof chartSchema>;

interface ChartToolState {
  chart: ChartConfig | null;
  tool: Chat.Tool<'javascript', { code: string }, unknown>;
}

export const useChartTool = (): ChartToolState => {
  const [chart, setChart] = useState<ChartConfig | null>(null);

  const getDataFunction = useRuntimeFunction({
    name: 'getData',
    description: 'Synchronously get the data for the chart',
    args: queryIngredientsSchema,
    result: s.array('the ingredients', ingredientSchema),
    deps: [],
    handler: (args, abortSignal) =>
      fetchIngredients(
        {
          ingredientIds: args.ingredientIds ?? undefined,
          startDate: args.startDate,
          endDate: args.endDate,
        },
        abortSignal,
      ),
  });

  const renderChartFunction = useRuntimeFunction({
    name: 'renderChart',
    description: 'Render a chart',
    args: chartSchema,
    deps: [setChart],
    handler: (args) => {
      setChart(args);
    },
  });

  const runtime = useRuntime({
    functions: [getDataFunction, renderChartFunction],
  });

  const toolJavaScript = useToolJavaScript({
    runtime,
  });

  return {
    tool: toolJavaScript,
    chart,
  };
};
