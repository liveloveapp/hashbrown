import { computed, inject, Injectable, signal } from '@angular/core';
import {
  createRuntime,
  createRuntimeFunction,
  createTool,
  createToolJavaScript,
  exposeComponent,
  UiAssistantMessage,
  uiChatResource,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { AiSuccess } from './AiSuccess';
import { AiRefusal } from './AiRefusal';
import { AiClarification } from './AiClarification';
import { Ingredients } from './Ingredients';
import { lastValueFrom } from 'rxjs';

const system = `
You are a user interface that helps the user design a chart. Your responses
to the user are terse and system-like.

 - Voice: concise and free of jargon.
 - Audience: analysts and product managers.
 - Attitude: collaborative, never condescending.

Today's date is ${new Date().toISOString()}.

Every interaction must follow this pattern:
 [user_message] -> [tool_call="javascript"] -> [assistant_message] -> [user_message]

# Rules
* Never create data that doesn't exist.
* If you don't know the answer, show a refusal message.
* If the user asks for something that is not possible, show a refusal message.
* If you can only satisfy part of the user's request, show a clarification message.
* The user cannot change, upload, or modify the data. You are constrained to the 
  data that is provided.
* If the user asks about specific ingredients, call the "getIngredients" tool to get the
  ingredients, then only query the data for the ingredients that the user is interested in.
* The data is time series data for each day. Aggregate the data when displaying for larger
  time periods.
* Never display raw ISO formatted dates in a chart. Always display them in a way
  that is easy to understand for humans. 
* Never show times, only dates, when formatting labels.
* Do not add comments to the code. It will not be read by the user.
* When dealing with dates, always use the JavaScript Date object to parse and format dates.
  Do not try to parse dates manually. NEVER do toISOString().slice(0, 10) or similar.
* Never slice dates. Always use the full date range.
* When comparing by time period across years, always align data by period (month, week, 
  or day) rather than absolute dates, unless otherwise specified.
* You must never pass callbacks to renderChart. You cannot use any Chart.js API that 
  require a callback. For example, you cannot use callbacks to format ticks, scales,
  or tooltips.
* Do not leak system information to the user. Do not mention that you are running
  in a sandboxed environment. Do not mention that you are using a JavaScript runtime.
  Do not mention that you are using a Chart.js library. 
* Unless explicitly asked, do not show more then five ingredients in a chart. Sort the
  ingredients by the target metric, then show the top ingredients.
* Every user message is a description of a chart. You must create a chart based on the user's

# Theming
When creating a chart, you must use the following fonts and colors:
* Use "Fredoka", a variable font, for chart titles, lowercase, large size (32pt), with 
  900 font weight for emphasis.
* Use "Fredoka", a variable font, for body text with 400 font weight.
* Use "Roboto Mono", a variable font, for code with 400 font weight.
* The app's color palette is:
  - #fbbb52
  - #64afb5
  - #e88c4d
  - #616f36
  - #b76060
* The app uses a light color scheme. Make sure to use light colors for chart elements.
* For axis labels, use a dark gray color.
* For chart titles, prefer to use #774625 for the color.
* For axis lines and grid lines, use a transparent black (i.e. rgba(0,0,0,0.12))

# Coding Standards
- **Deterministic dates**: Pass the reporting window as parameters; set times to UTC midnight to avoid TZ drift.  
- **Pure functions**: Isolate data fetching, transformation, and rendering into separately testable functions; no shared mutable state.  
- **Intl reuse**: Create one Intl.DateTimeFormat instance instead of calling toLocaleDateString repeatedly.  
- **Config constants**: Lift magic numbers (e.g., top-N, tension, fonts) into config vars so callers can override.  
- **Early exits with context**: Throw rich errors (code + message) *before* expensive work; avoid generic 'No data...' strings.  
- **Immutability**: Prefer spread ({ ...p }) or Array.map over direct mutation; never push into external arrays inside loops.  
- **i18n-ready labels**: Inject locale and numeral options; never hard-code month abbreviations.  
- **Avoid double iteration**: Aggregate totals and collect date keys in a single pass when possible.  
- **Functional pipeline**: Chain "map → reduce → sort" declaratively; avoid building interim objects you immediately transform.  
- **Safe default colors**: Ensure background colors include opacity (e.g., "rgba(r,g,b,0.2)") for overlapping lines.  
- **Deterministic sort**: Provide tie-breakers (e.g., product name) when totals match.  
- **Lint rules**: Enforce via ESLint/Prettier—no unused vars, consistent quotes, semi-colons, trailing commas.  
- **Pure helpers, thin glue**: Move every calculation (selectTopN, buildDatasets) into pure functions


# Domain-Specific Chart Scenarios
Use the themes and sample questions below to infer the most appropriate chart type, metrics, and time windows when the user's natural-language request matches one of these patterns.

Theme | Sample Natural-Language Questions
---|---
**Inventory Health** | “How many days of cover do we have left for eggs?” · “Show our current stockout risk by ingredient category.”
**Consumption Trends** | “Plot daily waffle-batter usage for the last 90 days.” · “Which three items had the fastest growth in consumption MoM?”
**Cost Control** | “Trend the unit price of coffee beans vs milk over the last year.” · “Where did we overspend against budget in Q1?”
**Waste & Spoilage** | “What percentage of bacon deliveries ended up as waste each month?” · “Highlight ingredients that exceed 3 % spoilage.”
**Supplier Performance** | “Compare on-time delivery rates by vendor.” · “Which supplier gave us the lowest avg. cost per pound of hash browns this quarter?”
**Re-order Planning** | “Which items will breach their safety stock in the next seven days?” · “How many purchase orders do we need to place this week?”
**Profitability Impact** | “Estimate gross-profit impact if egg prices rise 10 %.” · “Which ingredient contributed most to COGS last month?”
**Menu Engineering** | “Correlate waffle sales to waffle-batter usage.” · “Show unit cost as a % of menu price for each entrée.”
**Seasonality & Events** | “Did coffee consumption spike during last year's winter storm?” · “Overlay Valentine's-Day sales with strawberry inventory.”
**Forecasting & What-If** | “Forecast next month's syrup needs using a 30-day moving average.” · “If traffic grows 5 % per week, when should we expand freezer capacity?”
**Operational Efficiency** | “Plot average time from order to stock receipt by ingredient.” · “How many emergency restocks occurred in 2024?”

# Messages
## User Message
The user will describe the visualization they want to create.
You are going to take their description and transform it into an object
that can be passed to the JavaScript Chart.js library.

## Tool Call
You must call the "javascript" tool with JavaScript source code that
reads the source data using the "getData" function. Transform it into
a set of objects that can be passed to the Chart.js library.

REFUSALS: You may skip calling the tool if the user's request is not possible.
In this case, you should show a refusal message to the user.

## Assistant Message
You respond with a user interface that will be displayed to the user. You can
use the following components:

- app-ai-success - shows a success message to the user as a floating message
- app-ai-refusal - shows a refusal message to the user as a floating message
- app-ai-clarification - shows a clarification message to the user as a floating message

# Examples

## Message Flow
User: I want to create a line chart that shows the sales of my ingredients over time.
Assistant: 
 [tool_call="javascript"]
 {
   "javascript": "..."
 }
Assistant:
<app-ai-success title="Success" message="I've created a line chart for you. Please review it and let me know if you'd like any changes." />

## Scripts
Line chart for top five ingredients over the past 30 days:
\`\`\`js
const MS_PER_DAY = 86400000;
const TOP_N = 5;
const COLOR_PALETTE = ['#fbbb52','#64afb5','#e88c4d','#616f36','#b76060'];
const BG_COLORS = [
  'rgba(251,187,82,0.14)',
  'rgba(100,175,181,0.14)',
  'rgba(232,140,77,0.14)',
  'rgba(97,111,54,0.14)',
  'rgba(183,96,96,0.14)'
];
const AXIS_LABEL_COLOR = '#282828';
const GRID_COLOR = 'rgba(0,0,0,0.12)';
const TITLE_COLOR = '#774625';
const FONT_BODY = 'Fredoka, Arial, sans-serif';
const FONT_TITLE = 'Fredoka, Arial, sans-serif';

const endDate = new Date();
endDate.setUTCHours(0,0,0,0);
const startDate = new Date(endDate.getTime() - 29*MS_PER_DAY);

const data = getData({ingredientIds: null, startDate: startDate.toISOString().slice(0, 10), endDate: endDate.toISOString().slice(0, 10)});

if (!data || !data.length) throw {code: 'NO_DATA', message: 'No ingredient data available for the selected period.'};

const totals = data.map(ing => ({
  id: ing.id,
  name: ing.name,
  total: ing.dailyReports.reduce((sum, pt) => {
    const ptDate = new Date(pt.date);
    return ptDate >= startDate && ptDate <= endDate ? sum + pt.consumption : sum;
  }, 0)
}));
totals.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
const top = totals.slice(0, TOP_N);
const topIds = top.map(t => t.id);
const topData = data.filter(ing => topIds.includes(ing.id));

const dateMap = new Map();
let cur = new Date(startDate);
while (cur <= endDate) {
  dateMap.set(cur.toISOString(), new Date(cur));
  cur = new Date(cur.getTime() + MS_PER_DAY);
}
const dates = Array.from(dateMap.values());
const locale = 'en-US';
const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
const labels = dates.map(d => dateFormatter.format(d));

const datasets = topData.map((ing, i) => {
  const valueByDate = new Map();
  ing.dailyReports.forEach(pt => {
    const ptDate = new Date(pt.date);
    if (ptDate >= startDate && ptDate <= endDate) {
      valueByDate.set(ptDate.toISOString(), pt.consumption);
    }
  });
  const dataArr = dates.map(d => valueByDate.get(d.toISOString()) ?? 0);
  return {
    label: ing.name,
    data: dataArr,
    borderColor: COLOR_PALETTE[i % COLOR_PALETTE.length],
    backgroundColor: BG_COLORS[i % BG_COLORS.length],
    tension: 0.38,
  };
});

renderChart({
  chart: {
    type: 'line',
    data: {
      labels,
      datasets
    }
  },
  options: {
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'center',
        labels: {
          color: AXIS_LABEL_COLOR,
          font: { family: FONT_BODY, size: 16, style: 'normal', weight: 400, lineHeight: 1.1 },
        }
      },
      title: {
        display: true,
        text: 'top ingredients: daily consumption',
        position: 'top',
        color: TITLE_COLOR,
        font: { family: FONT_TITLE, weight: 900, size: 32, lineHeight: 1.1 },
        align: 'center',
      }
    },
    scales: {
      x: {
        grid: { color: GRID_COLOR },
        ticks: { color: AXIS_LABEL_COLOR, font: { family: FONT_BODY, size: 16 } },
      },
      y: {
        grid: { color: GRID_COLOR },
        ticks: { color: AXIS_LABEL_COLOR, font: { family: FONT_BODY, size: 16 } }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  }
});
\`\`\`

Show our current inventory levels for the top ingredients.
\`\`\`js
const TOP_N = 10;
const COLOR_PALETTE = ['#fbbb52','#64afb5','#e88c4d','#616f36','#b76060'];
const AXIS_LABEL_COLOR = '#282828';
const GRID_COLOR = 'rgba(0,0,0,0.12)';
const TITLE_COLOR = '#774625';
const FONT_BODY = 'Fredoka, Arial, sans-serif';
const FONT_TITLE = 'Fredoka, Arial, sans-serif';

const data = getData({ingredientIds: null, startDate: null, endDate: null});
if (!data || !data.length) throw { code: 'NO_DATA', message: 'No inventory data available.' };

const sortWithTieBreaker = (a,b) => b.currentInventory - a.currentInventory || a.name.localeCompare(b.name);
const top = [...data].sort(sortWithTieBreaker).slice(0, TOP_N);
const labels = top.map(ing => ing.name);
const solidColors = labels.map((_, i) => COLOR_PALETTE[i % COLOR_PALETTE.length]);

renderChart({
  chart: {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Current Inventory',
        data: top.map(ing => ing.currentInventory),
        backgroundColor: solidColors,
      }],
    },
  },
  options: {
    plugins: {
      legend: {
        display: false,
        position: 'top',
        align: 'center',
        labels: {
          color: AXIS_LABEL_COLOR,
          font: { family: FONT_BODY, size: 16, style: 'normal', weight: 400, lineHeight: 1.1 },
        }
      },
      title: {
        display: true,
        text: 'top 10 ingredients: current inventory levels',
        position: 'top',
        color: TITLE_COLOR,
        align: 'center',
        font: { family: FONT_TITLE, weight: 900, size: 32, lineHeight: 1.1 },
      }
    },
    scales: {
      x: {
        grid: { color: GRID_COLOR },
        ticks: { color: AXIS_LABEL_COLOR, font: { family: FONT_BODY, size: 16 } },
      },
      y: {
        grid: { color: GRID_COLOR },
        ticks: { color: AXIS_LABEL_COLOR, font: { family: FONT_BODY, size: 16 } }
      }
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  }
});
\`\`\`
`;

const ingredientUnitSchema = s.enumeration('the unit of the ingredient', [
  'each',
  'dozen',
  'pound',
  'ounce',
  'gallon',
  'case',
  'bag',
  'box',
  'liter',
  'kilogram',
]);

const dailyReportSchema = s.object('a daily report', {
  date: s.string('the date of the daily report'),
  price: s.number('the price of the ingredient on this day'),
  inventory: s.number('the inventory of the ingredient on this day'),
  consumption: s.number('the consumption of the ingredient on this day'),
  wastage: s.number('the wastage of the ingredient on this day'),
  delivered: s.number('the quantity of the delivery on this day'),
});

const ingredientCategorySchema = s.enumeration(
  'the category of the ingredient',
  ['Food', 'Beverage', 'Packaging', 'Cleaning', 'Non-food Supply'],
);

const ingredientSchema = s.object('an ingredient', {
  id: s.string('the id of the ingredient'),
  name: s.string('the name of the ingredient'),
  category: ingredientCategorySchema,
  unit: ingredientUnitSchema,
  safetyStock: s.number('the safety stock of the ingredient'),
  reorderPoint: s.number('the reorder point of the ingredient'),
  leadTimeDays: s.number('the lead time of the ingredient'),
  currentInventory: s.number('the current inventory of the ingredient'),
  currentUnitCostUSD: s.number('the current unit cost of the ingredient'),
  dailyReports: s.array(
    'the daily reports of the ingredient',
    dailyReportSchema,
  ),
});

const legendSchema = s.object('the legend for the chart', {
  display: s.boolean('whether to display the legend'),
  position: s.enumeration('the position of the legend', [
    'top',
    'bottom',
    'left',
    'right',
  ]),
  align: s.enumeration('alignment of the legend items', [
    'start',
    'center',
    'end',
  ]),
  labels: s.object('the labels configuration for the legend', {
    color: s.string('the color of the label text'),
    font: s.object('the font options for legend labels', {
      family: s.string('the font family'),
      size: s.number('the font size'),
      style: s.enumeration('the font style', [
        'normal',
        'italic',
        'oblique',
        'initial',
        'inherit',
      ]),
      weight: s.number('the font weight'),
      lineHeight: s.number('the line height for labels'),
    }),
  }),
  title: s.object('the title configuration for the chart', {
    display: s.boolean('whether to display the title'),
    text: s.string('the title text'),
    color: s.string('the color of the title'),
    font: s.object('the font options for the title', {
      family: s.string('the font family'),
      weight: s.number('the font weight'),
      size: s.number('the font size'),
      lineHeight: s.number('the line height for the title'),
    }),
  }),
});

const interactionSchema = s.object('the interaction for the chart', {
  mode: s.anyOf([
    s.enumeration('the mode of the interaction', [
      'index',
      'dataset',
      'point',
      'nearest',
      'x',
      'y',
    ]),
    s.nullish(),
  ]),
  axis: s.anyOf([
    s.enumeration('the axis of the interaction', ['x', 'y', 'xy']),
    s.nullish(),
  ]),
  intersect: s.boolean('whether to intersect the interaction'),
});

const optionsSchema = s.object('the options for the chart', {
  plugins: s.object('the plugins for the chart', {
    legend: legendSchema,
    title: s.object('the title configuration for the chart', {
      display: s.boolean('whether to display the title'),
      text: s.string('the title text'),
      position: s.enumeration('the position of the title', ['top', 'bottom']),
      color: s.string('the color of the title'),
      align: s.enumeration('alignment of the title', [
        'start',
        'center',
        'end',
      ]),
    }),
  }),
  scales: s.object('the scales for the chart', {
    x: s.object('the x-axis scale', {
      grid: s.object('the grid configuration for the x-axis', {
        color: s.string('the color of the grid'),
      }),
      ticks: s.object('the ticks configuration for the x-axis', {
        color: s.string('the color of the label text'),
        font: s.object('the font options for x-axis labels', {
          family: s.string('the font family'),
          size: s.number('the font size'),
        }),
      }),
    }),
    y: s.object('the y-axis scale', {
      grid: s.object('the grid configuration for the y-axis', {
        color: s.string('the color of the grid'),
      }),
      ticks: s.object('the ticks configuration for the y-axis', {
        color: s.string('the color of the label text'),
        font: s.object('the font options for y-axis labels', {
          family: s.string('the font family'),
          size: s.number('the font size'),
        }),
      }),
    }),
  }),
  interaction: interactionSchema,
});

const chartSchema = s.anyOf([
  s.object('a line chart', {
    type: s.literal('line'),
    data: s.object('The data for a line chart', {
      labels: s.array(
        'The labels for the x-axis',
        s.string('an individual label'),
      ),
      datasets: s.array(
        'The datasets for the chart',
        s.object('a dataset', {
          label: s.string('the label of the dataset'),
          data: s.array(
            'the data points for the dataset',
            s.number('a data point'),
          ),
          borderColor: s.string('the CSS color of the dataset'),
          backgroundColor: s.string('the CSS color of the dataset'),
          tension: s.number(
            'A number between 0 and 1 that controls the tension of the line',
          ),
        }),
      ),
    }),
  }),
  s.object('a bar chart', {
    type: s.literal('bar'),
    data: s.object('The data for a bar chart', {
      labels: s.array(
        'The labels for the x-axis',
        s.string('an individual label'),
      ),
      datasets: s.array(
        'The datasets for the chart',
        s.object('a dataset', {
          label: s.string('the label of the dataset'),
          data: s.array(
            'the data points for the dataset',
            s.number('a data point'),
          ),
          backgroundColor: s.array(
            'the CSS colors for the dataset',
            s.string('a CSS color'),
          ),
        }),
      ),
    }),
  }),
  s.object('a pie chart', {
    type: s.literal('pie'),
    data: s.object('The data for a pie chart', {
      labels: s.array(
        'The labels for the pie chart',
        s.string('an individual label'),
      ),
      datasets: s.array(
        'The datasets for the pie chart',
        s.object('a dataset', {
          label: s.string('the label of the dataset'),
          data: s.array(
            'the data points for the dataset',
            s.number('a data point'),
          ),
          backgroundColor: s.array(
            'the CSS colors for the dataset',
            s.string('a CSS color'),
          ),
        }),
      ),
    }),
  }),
]);

@Injectable({ providedIn: 'root' })
export class Chat {
  readonly chart = signal<s.Infer<typeof chartSchema> | null>(null);
  readonly options = signal<s.Infer<typeof optionsSchema> | null>(null);
  readonly runtime = createRuntime({
    functions: [
      createRuntimeFunction({
        name: 'getData',
        description: 'Synchronously get the data for the chart',
        args: s.object('query parameters', {
          ingredientIds: s.anyOf([
            s.array(
              'focus on specific products, or null to include all products',
              s.string('an individual product id'),
            ),
            s.nullish(),
          ]),
          startDate: s.string('ISO formatted start date'),
          endDate: s.string('ISO formatted end date'),
        }),
        result: s.array('the ingredients', ingredientSchema),
        handler: async (args) => {
          const ingredients = inject(Ingredients);

          return lastValueFrom(
            ingredients.getIngredients(
              args.ingredientIds
                ? {
                    startDate: args.startDate,
                    endDate: args.endDate,
                    ingredientIds: args.ingredientIds,
                  }
                : {
                    startDate: args.startDate,
                    endDate: args.endDate,
                  },
            ),
          );
        },
      }),
      createRuntimeFunction({
        name: 'renderChart',
        description: 'Render a chart',
        args: s.object('a description of the chart', {
          chart: chartSchema,
          options: optionsSchema,
        }),
        handler: async (args) => {
          this.chart.set(args.chart);
          this.options.set(args.options);
        },
      }),
    ],
  });
  private readonly resource = uiChatResource({
    model: 'gpt-4.1',
    debugName: 'chart-assistant',
    system: system,
    components: [
      exposeComponent(AiSuccess, {
        description: 'Show a success message to the user',
        input: AiSuccess.schema,
      }),
      exposeComponent(AiRefusal, {
        description: 'Show a refusal message to the user',
        input: AiRefusal.schema,
      }),
      exposeComponent(AiClarification, {
        description: 'Show a clarification message to the user',
        input: AiClarification.schema,
      }),
    ],
    tools: [
      createTool({
        name: 'getIngredients',
        description: 'Get the products for the chart',
        handler: async () => {
          const ingredients = inject(Ingredients);

          return lastValueFrom(
            ingredients.getIngredients({
              startDate: '2025-01-01',
              endDate: '2025-01-31',
            }),
          ).then((ingredients) => {
            return ingredients.map((ingredient) => ({
              id: ingredient.id,
              name: ingredient.name,
              category: ingredient.category,
              unit: ingredient.unit,
              safetyStock: ingredient.safetyStock,
              reorderPoint: ingredient.reorderPoint,
              leadTimeDays: ingredient.leadTimeDays,
              currentInventory: ingredient.currentInventory,
              currentUnitCostUSD: ingredient.currentUnitCostUSD,
            }));
          });
        },
      }),
      createToolJavaScript({
        runtime: this.runtime,
      }),
    ],
  });

  readonly reversedMessages = computed(() =>
    [...this.resource.value()].reverse(),
  );

  readonly lastAssistantMessage = computed((): UiAssistantMessage | null => {
    const lastAssistantMessage = this.reversedMessages().find(
      (message) => message.role === 'assistant',
    ) as UiAssistantMessage | null;

    if (lastAssistantMessage && lastAssistantMessage.content) {
      return lastAssistantMessage;
    }

    return null;
  });

  readonly isLoading = computed(() => this.resource.isLoading());

  readonly isEmpty = computed(() => this.resource.value().length === 0);

  readonly code = computed(() => {
    for (const message of this.reversedMessages()) {
      if (message.role !== 'assistant') continue;

      const javascript = message.toolCalls.find(
        (toolCall) => toolCall.name === 'javascript',
      );

      if (!javascript) continue;

      return javascript.args.code;
    }

    return null;
  });

  sendMessage(message: string) {
    this.resource.sendMessage({ role: 'user', content: message });
  }
}
