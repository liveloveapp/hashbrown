import { createRuntime, createRuntimeFunction } from '@hashbrownai/angular';
import { inject, Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { s } from '@hashbrownai/core';
import { chartSchema } from '../../chart/schema/chartSchema';
import { fastFoodQuerySchema } from '../schema/fast-food-query-schema';
import { fastFoodItemSchema } from '../schema/fast-food-item-schema';
import { FastFoodDatasetService } from '../data/fast-food-dataset.service';
import { FastFoodSortMetric } from '../models/fast-food-item';

@Injectable()
export class ChartRuntime {
  readonly chart = signal<s.Infer<typeof chartSchema> | null>(null);
  private readonly dataset = inject(FastFoodDatasetService);

  private readonly runtime = createRuntime({
    functions: [
      createRuntimeFunction({
        name: 'getData',
        description: 'Synchronously get the data for the chart',
        args: fastFoodQuerySchema,
        result: s.array('menu items', fastFoodItemSchema),
        handler: async (args) => {
          const sanitizeList = (values?: string[] | null) => {
            if (!values?.length) {
              return null;
            }
            const cleaned = values
              .map((value) => value?.trim())
              .filter((value): value is string => !!value);
            return cleaned.length ? cleaned : null;
          };

          const sanitizeNumber = (value?: number | string | null) => {
            if (value === null || value === undefined) {
              return null;
            }
            if (typeof value === 'number') {
              return Number.isFinite(value) ? value : null;
            }
            const trimmed = value.trim();
            if (!trimmed) {
              return null;
            }
            const parsed = Number(trimmed);
            return Number.isFinite(parsed) ? parsed : null;
          };

          const sanitizeLimit = (value?: number | string | null) => {
            const parsed = sanitizeNumber(value);
            if (parsed === null) {
              return null;
            }
            const rounded = Math.floor(parsed);
            return rounded > 0 ? rounded : null;
          };

          const allowedSortMetrics: FastFoodSortMetric[] = [
            'calories',
            'protein',
            'totalFat',
            'sodium',
            'sugar',
          ];

          const sanitizeSortBy = (
            value?: FastFoodSortMetric | string | null,
          ) => {
            if (!value) {
              return null;
            }
            const candidate =
              typeof value === 'string'
                ? (value.trim() as FastFoodSortMetric)
                : value;
            return allowedSortMetrics.includes(candidate) ? candidate : null;
          };

          const sanitizeSortDirection = (
            value?: 'asc' | 'desc' | string | null,
          ) => {
            if (!value) {
              return null;
            }
            const candidate =
              typeof value === 'string' ? value.trim().toLowerCase() : value;
            return candidate === 'asc' || candidate === 'desc'
              ? (candidate as 'asc' | 'desc')
              : null;
          };

          const normalizeSearchTerm = (value?: string | null) => {
            const trimmed = value?.trim();
            return trimmed ? trimmed : null;
          };

          return lastValueFrom(
            this.dataset.queryItems({
              itemIds: sanitizeList(args.itemIds ?? undefined),
              restaurants: sanitizeList(args.restaurants ?? undefined),
              categories: sanitizeList(args.categories ?? undefined),
              searchTerm: normalizeSearchTerm(args.searchTerm ?? null),
              maxCalories: sanitizeNumber(args.maxCalories ?? null),
              minCalories: sanitizeNumber(args.minCalories ?? null),
              minProtein: sanitizeNumber(args.minProtein ?? null),
              maxSodium: sanitizeNumber(args.maxSodium ?? null),
              limit: sanitizeLimit(args.limit ?? null),
              sortBy: sanitizeSortBy(args.sortBy ?? null),
              sortDirection: sanitizeSortDirection(args.sortDirection ?? null),
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

  async run(code: string): Promise<() => void> {
    const cancellationController = new AbortController();

    try {
      this.runtime.run(
        code,
        AbortSignal.any([
          AbortSignal.timeout(10000),
          cancellationController.signal,
        ]),
      );
    } catch (error) {
      console.error(error);
    }

    return () => {
      cancellationController.abort();
    };
  }
}
