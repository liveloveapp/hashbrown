import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Chart as ChartJS } from 'chart.js/auto';
import type { ChartType } from 'chart.js';
import { ChartRuntime } from '../tools/chart-runtime';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { ɵdeepEqual as deepEqual, s } from '@hashbrownai/core';
import { CodeLoader } from '../../chart/CodeLoader';
import type { FastFoodSortMetric } from '../models/fast-food-item';
import { buildChartOptions } from '../tools/chart-options';

let instanceId = 0;

const allowedChartTypes: ChartType[] = [
  'bar',
  'bubble',
  'doughnut',
  'line',
  'pie',
  'polarArea',
  'radar',
  'scatter',
];

type ChartInputConfig = {
  prompt: string;
  restaurants: string[];
  menuItems: string[];
  categories: string[];
  searchTerm: string | null;
  maxCalories: number | null;
  minCalories: number | null;
  minProtein: number | null;
  maxSodium: number | null;
  limit: number | null;
  sortBy: FastFoodSortMetric | null;
  sortDirection: 'asc' | 'desc' | null;
  chartType: ChartType | null;
};

const system = `
You produce a single structured completion—no multi-turn chat. For every input you
receive, return either Chart.js-ready JavaScript or an error payload, never prose.

 - Voice: concise and free of jargon.
 - Audience: menu strategists and nutrition analysts.
 - Attitude: collaborative, never condescending.

Today's date is ${new Date().toISOString()}.

## Dataset
Work exclusively with fastfood_v2.csv. Each row contains:
* chain — restaurant/brand name (e.g., McDonald's, Chick-fil-A).
* menu_item — full menu item label.
* short_name — compact alias for concise labeling.
* description — item summary or marketing copy.
* serving_size — human-readable portion description.
* categories — pipe-delimited taxonomy tags (split on "|").
* calories — total calories (kcal) per serving.
* total_fat_g, saturated_fat_g, trans_fat_g — grams of fat.
* cholesterol_mg — milligrams per serving.
* sodium_mg — milligrams per serving.
* carbs_g, fiber_g, sugar_g — grams.
* protein_g — grams.
* sources — pipe-delimited URLs backing the nutrition data.
* last_audited — ISO timestamp indicating data freshness.

Runtime note: the \`getData\` function returns normalized objects with camelCase keys—use
properties like \`restaurant\`, \`item\`, \`shortName\`, \`description\`, \`servingSize\`,
\`categories\`, macronutrients (\`calories\`, \`totalFat\`, \`protein\`, etc.), \`sources\`, and
\`lastAudited\` when building charts. The original snake_case column names (for
example, \`chain\`, \`menu_item\`, \`short_name\`) only exist inside the CSV; they are not
present on the JavaScript objects returned by \`getData\`, so referencing them will
produce \`undefined\` output.

## Normalized API (what getData returns)
Each item emitted by \`getData(...)\` exposes the following camelCase fields—only use these in charts:
* \`restaurant\` — chain name (CSV \`chain\`).
* \`item\` — full menu label (CSV \`menu_item\`).
* \`shortName\` — compact alias for labels (CSV \`short_name\`).
* \`description\` — marketing copy.
* \`servingSize\` — portion descriptor (CSV \`serving_size\`).
* \`categories\` — array of category tags (parsed from the pipe-delimited column).
* \`calories\`, \`totalFat\`, \`saturatedFat\`, \`transFat\`, \`cholesterol\`, \`sodium\`, \`totalCarbs\`, \`fiber\`, \`sugar\`, \`protein\` — numeric nutrients.
* \`sources\` — array of source URLs (split from the CSV).
* \`lastAudited\` — ISO timestamp (or null).

## Inputs
You are invoked with a JSON object containing:
* prompt — the natural-language chart request.
* chartType — optional Chart.js chart type hint
  (${allowedChartTypes.map((type) => `'${type}'`).join(', ')}).
* restaurants — optional array of restaurant names to prioritize.
* menuItems — optional array of menu item ids selected upstream.
* categories — optional list of category labels that match the dataset taxonomy.
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
1. getData(options) -> menu items from fastfood_v2.csv. Options: itemIds, restaurants,
   categories, searchTerm, maxCalories, minCalories, minProtein, maxSodium, limit,
   sortBy, sortDirection. Call it exactly once per chart with the best filters.
2. renderChart({ chart, options }) -> renders Chart.js config. Call it exactly once.

## Rules
* Never fabricate menu items or nutrient values. If no data matches, throw a
  descriptive { code: 'NO_DATA', message: '...' } error.
* Always include measurement units on axes/titles (grams, milligrams, % DV, kcal).
* Prefer ≤10 menu items unless the user explicitly asks for more detail.
* Default the legend placement to the bottom unless the user specifies otherwise.
* Use short names (\`item.shortName ?? item.item\`) for axis labels and reserve the
  full \`Restaurant - Item\` text for tooltip titles so long labels do not crowd the chart.
* Respect the \`chartType\` hint when provided. If it would misrepresent the data,
  choose the most appropriate Chart.js type instead.
* Choose chart types that fit the question (rankings -> bar, correlations -> scatter,
  composition -> pie, multi-metric -> grouped bars/lines).
* Format axes with human labels ("Protein (g)", "Sodium (mg)", etc.).
* Derived metrics (protein per calorie, sodium-to-protein) should be clearly
  described in labels.
* Whenever a chart spans multiple restaurants and menu items, label each data
  series or point with both the chain and item name (e.g., "McDonald's - Big Mac")
  using the normalized fields (
  \`item.restaurant\`, \`item.shortName || item.item\`).
* Respect sortBy/sortDirection hints when provided; otherwise sort by the metric
  emphasized in the prompt and break ties alphabetically.
* Escape EVERY string literal in the generated JavaScript. Do not emit raw
  apostrophes; either escape them (\\') or use template literals with backticks.
* Tooltips must be described using Mustache-style templates on
  \`options.plugins.tooltip\`. Templates support dot + bracket notation
  (e.g., \`{{ datum.dataset.meta[datum.dataIndex].label }}\`) but never arbitrary
  JavaScript. Available variables include:
  - \`datum\`: the Chart.js tooltip item (with \`label\`, \`dataIndex\`,
    \`dataset\`, \`parsed\`, \`formattedValue\`, etc.).
  - \`chart\`: the active Chart.js instance for advanced lookups.
  Attach any extra metadata you need (e.g., full labels, serving sizes) to your
  dataset objects so the template can read them (for example,
  \`dataset.tooltipMeta[datum.dataIndex]\`).
* Never register callbacks or plugins in renderChart options—the runtime compiles
  your templates into callbacks automatically.
* Theming:
  - Colors: #fbbb52, #64afb5, #e88c4d, #616f36, #b76060 (use translucent fills for
    overlapping lines/areas).
  - Axis label color #282828; grid color rgba(0,0,0,0.12); title color
    #3d3c3a.
  - Fonts: Fredoka (body 400, titles 900 at 18-32pt) and Roboto Mono for any code-like
    annotations.

## Example
\`\`\`js
const data = getData({
  restaurants: ["McDonald's"],
  categories: ['Entree', 'Sandwich'],
  searchTerm: 'chicken',
  maxCalories: 800,
  sortBy: 'protein',
  sortDirection: 'desc',
  limit: 5,
});
if (!data.length) throw { code: 'NO_DATA', message: 'No qualifying items.' };

const shortLabels = data.map((item) => item.shortName ?? item.item);
const protein = data.map((item) => item.protein);
const calories = data.map((item) => item.calories);
const tooltipMeta = data.map((item) => ({
  fullLabel: \`\${item.restaurant} - \${item.item}\`,
  servingSize: item.servingSize,
}));

renderChart({
  chart: {
    type: 'bar',
    data: {
      labels: shortLabels,
      datasets: [
        {
          label: 'Protein (g)',
          data: protein,
          backgroundColor: '#64afb5',
          tooltipMeta,
        },
        {
          label: 'Calories (kcal)',
          data: calories,
          backgroundColor: '#fbbb52',
          tooltipMeta,
        },
      ],
    },
  },
  options: {
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
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
        color: '#3d3c3a',
        align: 'center',
        font: {
          family: 'Fredoka, Arial, sans-serif',
          weight: 900,
          size: 18,
          lineHeight: 1.1,
        },
      },
      tooltip: {
        titleTemplate:
          '{{ datum.dataset.tooltipMeta[datum.dataIndex].fullLabel }}',
        afterTitleTemplate:
          'Serving size: {{ datum.dataset.tooltipMeta[datum.dataIndex].servingSize }}',
        labelTemplate: '{{ datum.dataset.label }}: {{ datum.formattedValue }}',
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(0,0,0,0.12)' },
        ticks: {
          color: '#282828',
          font: { family: 'Fredoka, Arial, sans-serif', size: 16 },
          callback: (_, index) => shortLabels[index],
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
  imports: [CodeLoader],
  template: `
    <section class="chart-wrapper">
      <canvas #canvasRef></canvas>

      @if (showDescribingPhase()) {
        <div class="chart-overlay describing">
          <app-code-loader [code]="description()" />
        </div>
      } @else if (completion.isSending()) {
        <div class="chart-overlay sending">Generating chart...</div>
      } @else if (completion.isReceiving()) {
        <div class="chart-overlay code-loader"></div>
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
      margin: 16px auto 24px;
    }

    .chart-wrapper {
      position: relative;
      width: 100%;
      min-height: 320px;
      padding: 16px;
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
      width: 100%;
      height: 100%;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #774625;
      font-family: 'Fredoka', sans-serif;
      font-size: 16px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: lowercase;
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

  readonly showDescribingPhase = computed(() => {
    return this.completion.isSending();
  });
  readonly description = computed(() => {
    return JSON.stringify(this.chart(), null, 2);
  });
  readonly errorMessage = computed(() => {
    const result = this.completion.value()?.result;

    if (!result || result.type === 'SUCCESS') {
      return null;
    }

    return result.message;
  });
  readonly completion = structuredCompletionResource({
    model: 'gpt-5-chat-latest',
    debugName: `chart-${this.instanceId}`,
    system,
    input: computed(
      () => {
        const chart = this.chart();
        const prompt = chart.prompt?.trim();

        if (!prompt) {
          return null;
        }

        const sanitizeArray = (value?: string[]) => {
          if (!value || !value.length) {
            return null;
          }

          const cleaned = value
            .map((entry) => entry?.trim())
            .filter((entry): entry is string => !!entry);

          return cleaned.length ? cleaned : null;
        };
        const sanitizeNumber = (value?: number | null) => {
          if (value === null || value === undefined) {
            return null;
          }

          return Number.isFinite(value) ? value : null;
        };
        const sanitizeSortBy = (
          value?: FastFoodSortMetric | string | null,
        ): FastFoodSortMetric | null => {
          if (!value) {
            return null;
          }

          const trimmed =
            typeof value === 'string'
              ? (value.trim() as FastFoodSortMetric)
              : value;
          const allowed: FastFoodSortMetric[] = [
            'calories',
            'protein',
            'totalFat',
            'sodium',
            'sugar',
          ];

          return allowed.includes(trimmed) ? trimmed : null;
        };
        const sanitizeSortDirection = (
          value?: 'asc' | 'desc' | string | null,
        ): 'asc' | 'desc' | null => {
          if (!value) {
            return null;
          }

          const trimmed = typeof value === 'string' ? value.trim() : value;

          return trimmed === 'asc' || trimmed === 'desc' ? trimmed : null;
        };
        const sanitizeChartType = (
          value?: ChartType | string | null,
        ): ChartType | null => {
          if (!value) {
            return null;
          }

          const candidate =
            typeof value === 'string' ? (value.trim() as ChartType) : value;

          return allowedChartTypes.includes(candidate) ? candidate : null;
        };

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
          sortBy: sanitizeSortBy(chart.sortBy),
          sortDirection: sanitizeSortDirection(chart.sortDirection),
          chartType: sanitizeChartType(chart.chartType),
        };

        console.log(`[${this.instanceId}] Input:`, payload);

        return payload;
      },
      { equal: deepEqual },
    ),
    schema: s.streaming.object('Result', {
      result: s.anyOf([
        s.object('Success', {
          type: s.literal('SUCCESS'),
          javascript: s.streaming.string(
            'The JavaScript code to render the chart',
          ),
        }),
        s.object('Error', {
          type: s.literal('ERROR'),
          message: s.streaming.string('The error message'),
        }),
      ]),
    }),
  });
  readonly code = computed(() => {
    const result = this.completion.value()?.result;

    if (!result || result.type === 'ERROR') {
      console.error(`[${this.instanceId}] Error:`, this.completion.value());
      return null;
    }

    return result.javascript;
  });

  constructor() {
    effect(async (onTeardown) => {
      const result = this.completion.value()?.result;

      if (!result || result.type === 'ERROR') {
        return;
      }

      const code = result.javascript;
      const cancel = await this.chartRuntime.run(code);

      onTeardown(cancel);
    });

    effect((onCleanup) => {
      const canvas = this.canvasRef().nativeElement;
      const chartConfig = this.chartRuntime.chart();

      if (!chartConfig) {
        return;
      }

      const chartOptions = buildChartOptions(chartConfig.options);
      const chart = new ChartJS(canvas, {
        ...chartConfig.chart,
        options: chartOptions,
      });

      onCleanup(() => {
        canvas.classList.remove('rendering');
        chart.destroy();
      });
    });
  }
}
