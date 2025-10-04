```ts
import { createRuntimeFunction } from '@hashbrownai/angular';

@Injectable({ providedIn: 'root' })
class ChartRuntime {
  readonly chart = signal<s.Infer<typeof chartSchema> | null>(null);

  getData = createRuntimeFunction({
    name: 'getData',
    description: 'Synchronously get the data for the chart',
    args: queryIngredientsSchema,
    result: s.array('the ingredients', ingredientSchema),
    handler: async (args) => {
      const ingredients = inject(Ingredients);

      return ingredients.getAll();
    },
  });

  render = createRuntimeFunction({
    name: 'renderChart',
    description: 'Render a chart',
    args: chartSchema,
    handler: async (args) => {
      this.chart.set(args);
    },
  });

  runtime = createRuntime({
    functions: [this.getData, this.render],
  });
}
```
