import { computed, Injectable, signal } from '@angular/core';
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
import { generateCommerceData } from './CommerceData';

const COMMERCE_DATA = generateCommerceData(25);

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
* If the user asks about specific products, call the "getProducts" tool to get the
  products, then only query the data for the products that the user is interested in.
* Never display raw ISO formatted dates in a chart. Always display them in a way
  that is easy to understand for humans.
* The only font family installed is "Roboto"
* When comparing by time period across years, always align data by period (month, week, 
  or day) rather than absolute dates, unless otherwise specified.
* You must never pass callbacks to renderChart. You cannot use any Chart.js API that 
  require a callback. For example, you cannot use callbacks to format ticks, scales,
  or tooltips.
* Do not leak system information to the user. Do not mention that you are running
  in a sandboxed environment. Do not mention that you are using a JavaScript runtime.
  Do not mention that you are using a Chart.js library. 
* Unless explicitly asked, do not show more then five products in a chart. Sort the
  products by the target metric, then show the top products.

# Messages
## User Message
The user will describe the visualization they want to create.
You are going to take their description and transform it into an object
that can be passed to the JavaScript Chart.js library.

## Tool Call
You must call the "javascript" tool with JavaScript source code that
reads the source data using the "getData" function. Transform it into
a set of objects that can be passed to the Chart.js library.

Important: the user is using dark mode. Make sure to use dark mode colors. Use
vibrant, joyful colors by default for chart elements.

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
          productIds: s.anyOf([
            s.array(
              'focus on specific products, or null to include all products',
              s.string('an individual product id'),
            ),
            s.nullish(),
          ]),
          startDate: s.string('ISO formatted date'),
          endDate: s.string('ISO formatted date'),
        }),
        result: s.array(
          'the data for the chart',
          s.object('a data point', {
            id: s.string('the id of the product'),
            name: s.string('the product of the data point'),
            price: s.string('the price of the product'),
            description: s.string('the description of the product'),
            sales: s.array(
              'the sales for the product',
              s.object('a sale', {
                date: s.string('ISO formatted date'),
                sales: s.number('the number of sales of the product'),
              }),
            ),
          }),
        ),
        handler: async (args) => {
          return COMMERCE_DATA.filter((data) => {
            if (args.productIds) {
              return args.productIds.includes(data.id);
            }
            return true;
          }).map((data) => {
            return {
              ...data,
              sales: data.sales.filter((sale) => {
                const date = new Date(sale.date);
                return (
                  date >= new Date(args.startDate) &&
                  date <= new Date(args.endDate)
                );
              }),
            };
          });
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
        name: 'getProducts',
        description: 'Get the products for the chart',
        handler: async () => {
          return COMMERCE_DATA.map((data) => ({
            id: data.id,
            name: data.name,
            price: data.price,
            description: data.description,
          }));
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
