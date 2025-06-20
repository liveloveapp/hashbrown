import { computed, Injectable, signal } from '@angular/core';
import {
  exposeComponent,
  UiAssistantMessage,
  uiChatResource,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import {
  createToolJavaScript,
  defineAsyncRuntime,
  defineFunction,
  defineFunctionWithArgs,
} from '@hashbrownai/tool-javascript';
import { AiSuccess } from './AiSuccess';
import { AiRefusal } from './AiRefusal';
import { AiClarification } from './AiClarification';

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
      family: s.string('the font family, default to "sans-serif"'),
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

const system = `
You are a user interface that helps the user design a chart. Your responses
to the user are terse and system-like.

 - Voice: concise and free of jargon.
 - Audience: software engineers and product managers.
 - Attitude: collaborative, never condescending.

Your goal is to help the user design a chart. 

Every interaction must follow this pattern:
 [user_message] -> [tool_call="javascript"] -> [assistant_message] -> [user_message]

# Rules
* Never create data that doesn't exist.
* If you don't know the answer, show a refusal message.
* If the user asks for something that is not possible, show a refusal message.
* If you can only satisfy part of the user's request, show a clarification message.
* The user cannot change, upload, or modify the data. You are constrained to the 
data that is provided.

# Messages
## User Message
The user will describe the visualization they want to create.
You are going to take their description and transform it into an object
that can be passed to the JavaScript Chart.js library.

## Tool Call
You must call the "javascript" tool with JavaScript source code that
reads the source data using the "getData" function. Transform it into
a set of objects that can be passed to the Chart.js library.

Important: the user is using dark mode. Make sure to use dark mode colors. Always
start with colorful, vibrant colors for the charts.

REFUSALS: You may skip calling the tool if the user's request is not possible.
In this case, you should show a refusal message to the user.

## Assistant Message
You respond with a user interface that will be displayed to the user. You can
use the following components:

- app-ai-success - shows a success message to the user as a floating message
- app-ai-refusal - shows a refusal message to the user as a floating message
- app-ai-clarification - shows a clarification message to the user as a floating message

# Examples

User: I want to create a line chart that shows the sales of my products over time.
Assistant: 
 [tool_call="javascript"]
 {
   "javascript": "..."
 }
Assistant:
<app-ai-success title="Success" message="I've created a line chart for you. Please review it and let me know if you'd like any changes." />

`;

@Injectable({ providedIn: 'root' })
export class Chat {
  readonly chart = signal<s.Infer<typeof chartSchema> | null>(null);
  readonly options = signal<s.Infer<typeof optionsSchema> | null>(null);
  private readonly runtime = defineAsyncRuntime({
    loadVariant: () =>
      import('@jitl/quickjs-singlefile-browser-debug-asyncify').then(
        (m) => m.default,
      ),
    functions: [
      defineFunction({
        name: 'getData',
        description: 'Get the data for the chart',
        output: s.array(
          'the data for the chart',
          s.object('a data point', {
            product: s.string('the product of the data point'),
            sales: s.array(
              'the sales for the product',
              s.object('a sale', {
                month: s.string('the month of the sale in YYYY-MM format'),
                revenue: s.number('the revenue of the sale'),
                volume: s.number('the volume of the sale'),
              }),
            ),
          }),
        ),
        handler: async () => {
          return [
            {
              product: 'Product A',
              sales: [
                { month: '2022-09', revenue: 1200, volume: 100 },
                { month: '2022-10', revenue: 1500, volume: 110 },
                { month: '2022-11', revenue: 1700, volume: 120 },
                { month: '2022-12', revenue: 1600, volume: 130 },
                { month: '2023-01', revenue: 1800, volume: 150 },
                { month: '2023-02', revenue: 1900, volume: 160 },
                { month: '2023-03', revenue: 2000, volume: 170 },
                { month: '2023-04', revenue: 2100, volume: 180 },
                { month: '2023-05', revenue: 2200, volume: 190 },
                { month: '2023-06', revenue: 2300, volume: 200 },
                { month: '2023-07', revenue: 2400, volume: 210 },
                { month: '2023-08', revenue: 2500, volume: 220 },
                { month: '2023-09', revenue: 2600, volume: 230 },
              ],
            },
            {
              product: 'Product B',
              sales: [
                { month: '2022-09', revenue: 1000, volume: 100 },
                { month: '2022-10', revenue: 1100, volume: 110 },
                { month: '2022-11', revenue: 1200, volume: 120 },
                { month: '2022-12', revenue: 1300, volume: 130 },
                { month: '2023-01', revenue: 1400, volume: 140 },
                { month: '2023-02', revenue: 1500, volume: 150 },
                { month: '2023-03', revenue: 1600, volume: 160 },
                { month: '2023-04', revenue: 1700, volume: 170 },
                { month: '2023-05', revenue: 1800, volume: 180 },
                { month: '2023-06', revenue: 1900, volume: 190 },
                { month: '2023-07', revenue: 2000, volume: 200 },
                { month: '2023-08', revenue: 2100, volume: 210 },
                { month: '2023-09', revenue: 2200, volume: 220 },
              ],
            },
            {
              product: 'Product C',
              sales: [
                { month: '2022-09', revenue: 900, volume: 100 },
                { month: '2022-10', revenue: 950, volume: 110 },
                { month: '2022-11', revenue: 1000, volume: 120 },
                { month: '2022-12', revenue: 1050, volume: 130 },
                { month: '2023-01', revenue: 1100, volume: 140 },
                { month: '2023-02', revenue: 1150, volume: 150 },
                { month: '2023-03', revenue: 1200, volume: 245 },
                { month: '2023-04', revenue: 1250, volume: 170 },
                { month: '2023-05', revenue: 1300, volume: 200 },
                { month: '2023-06', revenue: 1350, volume: 190 },
                { month: '2023-07', revenue: 1400, volume: 200 },
                { month: '2023-08', revenue: 1450, volume: 210 },
                { month: '2023-09', revenue: 1500, volume: 185 },
              ],
            },
          ];
        },
      }),
      defineFunctionWithArgs({
        name: 'renderChart',
        description: 'Render a chart',
        input: s.object('a description of the chart', {
          chart: chartSchema,
          options: optionsSchema,
        }),
        output: s.nullish(),
        handler: async (args) => {
          this.chart.set(args.chart);
          this.options.set(args.options);
          return null;
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
        description: 'A success message',
        input: AiSuccess.schema,
      }),
      exposeComponent(AiRefusal, {
        description: 'A refusal message',
        input: AiRefusal.schema,
      }),
      exposeComponent(AiClarification, {
        description: 'A clarification message',
        input: AiClarification.schema,
      }),
    ],
    tools: [
      createToolJavaScript({
        runtime: this.runtime,
      }),
    ],
  });

  readonly lastAssistantMessage = computed((): UiAssistantMessage | null => {
    const lastAssistantMessage = this.resource
      .value()
      .reverse()
      .find(
        (message) => message.role === 'assistant',
      ) as UiAssistantMessage | null;

    if (lastAssistantMessage && lastAssistantMessage.content) {
      return lastAssistantMessage;
    }

    return null;
  });

  readonly isLoading = computed(() => this.resource.isLoading());

  sendMessage(message: string) {
    this.resource.sendMessage({ role: 'user', content: message });
  }
}
