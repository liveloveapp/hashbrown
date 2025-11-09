import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Chart as ChartJS } from 'chart.js/auto';
import { ChartRuntime } from '../tools/chart-runtime';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { ɵdeepEqual as deepEqual, s } from '@hashbrownai/core';
import { Squircle } from '../../squircle';
import { CodeLoader } from '../../chart/CodeLoader';
import { DescribingLoader } from './describing-loader';
import type { FastFoodSortMetric } from '../models/fast-food-item';

let instanceId = 0;

type ChartInputConfig = {
  prompt: string;
  restaurants: string[] | null;
  menuItems: string[] | null;
  categories: string[] | null;
  searchTerm: string | null;
  maxCalories: number | null;
  minCalories: number | null;
  minProtein: number | null;
  maxSodium: number | null;
  limit: number | null;
  sortBy: FastFoodSortMetric | null;
  sortDirection: 'asc' | 'desc' | null;
};

const system = `
You produce a single structured completion—no multi-turn chat. For every input you
receive, return either Chart.js-ready JavaScript or an error payload, never prose.

 - Voice: concise and free of jargon.
 - Audience: menu strategists and nutrition analysts.
 - Attitude: collaborative, never condescending.

Today's date is ${new Date().toISOString()}.

## Dataset
Work exclusively with fastfood.csv. Each row contains:
* restaurant — chain name (e.g., Mcdonalds, Burger King).
* item — menu item label.
* calories — total calories (kcal).
* cal_fat — calories from fat.
* total_fat, sat_fat, trans_fat — grams of fat.
* cholesterol — milligrams.
* sodium — milligrams.
* total_carb, fiber, sugar — grams.
* protein — grams.
* vit_a, vit_c, calcium — % daily value.
* salad — categorical flag (treat as menuCategory).

## Inputs
You are invoked with a JSON object containing:
* prompt — the natural-language chart request.
* restaurants — optional array of restaurant names to prioritize.
* menuItems — optional array of menu item ids selected upstream.
* categories — optional list of menuCategory labels (e.g., "Salad", "Other").
* searchTerm — optional free-text filter.
* maxCalories / minCalories — numeric calorie bounds.
* minProtein — minimum protein in grams.
* maxSodium — maximum sodium in milligrams.
* limit — maximum number of menu items to fetch.
* sortBy / sortDirection — requested ordering before visualization.

When menuItems are provided, treat them as the authoritative ids and pass them to
getData via "itemIds" without altering the order. Otherwise, apply the remaining
filters to fetch the smallest slice of data that fully answers the prompt.

## Runtime Functions
1. getData(options) → menu items from fastfood.csv. Options: itemIds, restaurants,
   categories, searchTerm, maxCalories, minCalories, minProtein, maxSodium, limit,
   sortBy, sortDirection. Call it exactly once per chart with the best filters.
2. renderChart({ chart, options }) → renders Chart.js config. Call it exactly once.

## Rules
* Never fabricate menu items or nutrient values. If no data matches, throw a
  descriptive { code: 'NO_DATA', message: '...' } error.
* Always include measurement units on axes/titles (grams, milligrams, % DV, kcal).
* Prefer ≤10 menu items unless the user explicitly asks for more detail.
* Choose chart types that fit the question (rankings → bar, correlations → scatter,
  composition → pie, multi-metric → grouped bars/lines).
* Format axes with human labels ("Protein (g)", "Sodium (mg)", etc.).
* Derived metrics (protein per calorie, sodium-to-protein) should be clearly
  described in labels.
* Respect sortBy/sortDirection hints when provided; otherwise sort by the metric
  emphasized in the prompt and break ties alphabetically.
* Theming:
  - Colors: #fbbb52, #64afb5, #e88c4d, #616f36, #b76060 (use translucent fills for
    overlapping lines/areas).
  - Axis label color #282828; grid color rgba(0,0,0,0.12); title color #774625.
  - Fonts: Fredoka (body 400, titles 900 at 18–32pt) and Roboto Mono for any code-like
    annotations.
* Never register callbacks or plugins in renderChart options.

## Example
\`\`\`js
const data = getData({
  restaurants: ['Mcdonalds'],
  searchTerm: 'chicken',
  maxCalories: 800,
  sortBy: 'protein',
  sortDirection: 'desc',
  limit: 5,
});
if (!data.length) throw { code: 'NO_DATA', message: 'No qualifying items.' };

const labels = data.map((item) => item.item);
const protein = data.map((item) => item.protein);
const calories = data.map((item) => item.calories);

renderChart({
  chart: {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Protein (g)',
          data: protein,
          backgroundColor: '#64afb5',
        },
        {
          label: 'Calories (kcal)',
          data: calories,
          backgroundColor: '#fbbb52',
        },
      ],
    },
  },
  options: {
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'center',
        labels: {
          color: '#282828',
          font: {
            family: 'Fredoka, Arial, sans-serif',
            size: 16,
            style: 'normal',
            weight: 400,
            lineHeight: 1.1,
          },
        },
      },
      title: {
        display: true,
        text: "McDonald's chicken sandwiches: protein vs calories",
        position: 'top',
        color: '#774625',
        align: 'center',
        font: {
          family: 'Fredoka, Arial, sans-serif',
          weight: 900,
          size: 28,
          lineHeight: 1.1,
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(0,0,0,0.12)' },
        ticks: {
          color: '#282828',
          font: { family: 'Fredoka, Arial, sans-serif', size: 16 },
        },
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.12)' },
        ticks: {
          color: '#282828',
          font: { family: 'Fredoka, Arial, sans-serif', size: 16 },
        },
      },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
  },
});
\`\`\`
`;

@Component({
  selector: 'app-chart',
  providers: [ChartRuntime],
  imports: [Squircle, CodeLoader, DescribingLoader],
  template: `
    <section
      class="chart-wrapper"
      appSquircle="16"
      [appSquircleBorderWidth]="1"
      appSquircleBorderColor="#EEC7AD"
    >
      <canvas #canvasRef></canvas>
      @if (showDescribingPhase()) {
        <div class="chart-overlay describing">
          <app-describing-loader />
        </div>
      } @else if (showCodeLanding()) {
        <div class="chart-overlay code-loader">
          <app-code-loader [code]="codeSample()!" />
        </div>
      }

      @if (errorMessage()) {
        <div class="chart-error">{{ errorMessage() }}</div>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      width: var(--max-article-width);
      margin: 8px auto 16px;
    }

    .chart-wrapper {
      position: relative;
      width: 100%;
      min-height: 320px;
      padding: 16px;
      background: #fff;
    }

    canvas {
      width: 100%;
      height: 100%;
      transition: opacity 0.25s ease;
    }

    canvas.rendering {
      opacity: 0;
    }

    .chart-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(250, 249, 240, 0.92);
      color: #774625;
      font-family: 'Fredoka', sans-serif;
      font-size: 16px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: lowercase;
    }

    .chart-overlay.code-loader {
      background: rgba(250, 249, 240, 0.96);
    }

    .chart-overlay.describing {
      background: rgba(250, 249, 240, 0.92);
    }

    .chart-error {
      margin-top: 12px;
      padding: 12px 16px;
      border-radius: 12px;
      border: 1px solid rgba(183, 96, 96, 0.4);
      background: rgba(183, 96, 96, 0.12);
      color: #b76060;
      font-family: 'Fredoka', sans-serif;
    }
  `,
})
export class Chart {
  readonly instanceId = instanceId++;

  readonly chart = input.required<ChartInputConfig>();

  readonly chartRuntime = inject(ChartRuntime);
  readonly canvasRef =
    viewChild.required<ElementRef<HTMLCanvasElement>>('canvasRef');
  readonly hasRenderedChart = signal(false);
  readonly codeSample = signal<string | null>(null);
  readonly hasStreamingResponse = signal(false);
  readonly isChartInputComplete = computed(() => {
    const streamedChart = this.chart();

    return !!streamedChart?.prompt?.trim();
  });
  readonly showDescribingPhase = computed(() => {
    if (!this.isChartInputComplete()) {
      return true;
    }

    return !this.hasStreamingResponse();
  });
  readonly errorMessage = computed(() => {
    const value = this.completion.value();

    if (!value || value.result.type === 'SUCCESS') {
      return null;
    }

    return value.result.message;
  });
  readonly showCodeLanding = computed(
    () =>
      this.hasStreamingResponse() &&
      !!this.codeSample() &&
      !this.hasRenderedChart(),
  );
  readonly completion = structuredCompletionResource({
    model: 'gpt-5-mini',
    debugName: `chart-${this.instanceId}`,
    system,
    input: computed(
      () => {
        const chart = this.chart();
        const prompt = chart.prompt?.trim();

        if (!prompt) {
          return null;
        }

        const sanitizeArray = (value?: string[] | null) =>
          value && value.length ? value : null;
        const sanitizeNumber = (value?: number | null) =>
          typeof value === 'number' && Number.isFinite(value) ? value : null;
        const payload = {
          prompt,
          restaurants: sanitizeArray(chart.restaurants),
          menuItems: sanitizeArray(chart.menuItems),
          categories: sanitizeArray(chart.categories),
          searchTerm: chart.searchTerm?.trim() || null,
          maxCalories: sanitizeNumber(chart.maxCalories),
          minCalories: sanitizeNumber(chart.minCalories),
          minProtein: sanitizeNumber(chart.minProtein),
          maxSodium: sanitizeNumber(chart.maxSodium),
          limit: sanitizeNumber(chart.limit),
          sortBy: chart.sortBy ?? null,
          sortDirection: chart.sortDirection ?? null,
        };

        console.log(`[${this.instanceId}] Input:`, payload);

        return payload;
      },
      { equal: deepEqual },
    ),
    schema: s.object('Result', {
      result: s.anyOf([
        s.object('Success', {
          type: s.literal('SUCCESS'),
          javascript: s.string('The JavaScript code to render the chart'),
        }),
        s.object('Error', {
          type: s.literal('ERROR'),
          message: s.string('The error message'),
        }),
      ]),
    }),
  });

  constructor() {
    let wasLoading = false;
    effect(() => {
      const isLoading = this.completion.isLoading();

      if (isLoading && !wasLoading) {
        this.hasRenderedChart.set(false);
        this.codeSample.set(null);
        this.hasStreamingResponse.set(false);
      }

      wasLoading = isLoading;

      if (isLoading) {
        return;
      }

      const value = this.completion.value();

      if (value?.result.type === 'SUCCESS') {
        this.codeSample.set(value.result.javascript);
      } else {
        this.codeSample.set(null);
      }
    });

    effect(() => {
      if (this.completion.isReceiving()) {
        this.hasStreamingResponse.set(true);
      }
    });

    effect((onTeardown) => {
      const value = this.completion.value();

      if (!value || value.result.type === 'ERROR') {
        return;
      }

      const code = value.result.javascript;
      const cancel = this.chartRuntime.run(code);

      onTeardown(cancel);
    });

    effect((onCleanup) => {
      const canvas = this.canvasRef().nativeElement;
      const chartConfig = this.chartRuntime.chart();

      if (!chartConfig) {
        return;
      }

      this.hasRenderedChart.set(false);
      canvas.classList.add('rendering');
      let chart: ChartJS | null = null;
      const timeout = setTimeout(() => {
        chart = new ChartJS(canvas, {
          ...chartConfig.chart,
          options: {
            responsive: true,
            maintainAspectRatio: true,
            borderColor: 'rgba(0, 0, 0, 0.1)',
            ...chartConfig.options,
            interaction: chartConfig.options.interaction
              ? {
                  mode: chartConfig.options.interaction.mode ?? undefined,
                  axis: chartConfig.options.interaction.axis ?? undefined,
                  intersect:
                    chartConfig.options.interaction.intersect ?? undefined,
                }
              : undefined,
          },
        });

        this.hasRenderedChart.set(true);
        canvas.classList.remove('rendering');
      }, 300);

      onCleanup(() => {
        clearTimeout(timeout);
        canvas.classList.remove('rendering');
        chart?.destroy();
      });
    });
  }
}
