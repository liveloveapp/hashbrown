import { createRuntime, createRuntimeFunction } from '@hashbrownai/angular';
import { inject, Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { s } from '@hashbrownai/core';
import { chartSchema } from '../../chart/schema/chartSchema';
import { fastFoodQuerySchema } from '../schema/fast-food-query-schema';
import { fastFoodItemSchema } from '../schema/fast-food-item-schema';
import { FastFoodDatasetService } from '../data/fast-food-dataset.service';

@Injectable()
export class ChartRuntime {
  readonly chart = signal<s.Infer<typeof chartSchema> | null>(null);

  private readonly runtime = createRuntime({
    functions: [
      createRuntimeFunction({
        name: 'getData',
        description: 'Synchronously get the data for the chart',
        args: fastFoodQuerySchema,
        result: s.array('menu items', fastFoodItemSchema),
        handler: async (args) => {
          const dataset = inject(FastFoodDatasetService);

          return lastValueFrom(
            dataset.queryItems({
              itemIds: args.itemIds ?? null,
              restaurants: args.restaurants ?? null,
              categories: args.categories ?? null,
              searchTerm: args.searchTerm ?? null,
              maxCalories: args.maxCalories ?? null,
              minCalories: args.minCalories ?? null,
              minProtein: args.minProtein ?? null,
              maxSodium: args.maxSodium ?? null,
              limit: args.limit ?? null,
              sortBy: args.sortBy ?? null,
              sortDirection: args.sortDirection ?? null,
            }),
          );
        },
      }),
      createRuntimeFunction({
        name: 'renderChart',
        description: 'Render a chart',
        args: chartSchema,
        handler: async (args) => {
          this.chart.set(args);
        },
      }),
    ],
  });

  describe() {
    return this.runtime.describe();
  }

  run(code: string): () => void {
    const cancellationController = new AbortController();

    this.runtime.run(
      code,
      AbortSignal.any([
        AbortSignal.timeout(10000),
        cancellationController.signal,
      ]),
    );

    return () => {
      cancellationController.abort();
    };
  }
}
