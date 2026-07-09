import { ChartType } from 'chart.js';
import { Injectable } from '@angular/core';
import { s } from '@hashbrownai/core';
import {
  createUiKit,
  exposeComponent,
  exposeMarkdown,
} from '@hashbrownai/angular';
import { ExecutiveSummary } from './elements/executive-summary';
import { HorizontalRule } from './elements/hr';
import { Heading } from './elements/heading';
import { Citation } from './elements/citation';
import { Chart } from './elements/chart';
import { ChartGhostLoader } from './elements/chart-ghost-loader';
import { MagicTextRenderer } from './magic-text-renderer';

const chartTypeHints: ChartType[] = [
  'bar',
  'bubble',
  'doughnut',
  'line',
  'pie',
  'polarArea',
  'radar',
  'scatter',
];

@Injectable({
  providedIn: 'root',
})
export class ChatKit {
  readonly kit = createUiKit({
    components: [
      exposeComponent(ExecutiveSummary, {
        name: 'executive-summary',
        description: `
          Present a concise executive summary at the top of the article. Keep it
          to one or two sentences that pull forward the sharpest dataset-backed
          takeaways before the detailed analysis begins.
        `,
        input: {
          text: s.streaming.string('The summary text stitched from the data'),
        },
      }),
      exposeComponent(HorizontalRule, {
        name: 'hr',
        description: 'Show a horizontal rule to separate sections',
      }),
      exposeMarkdown({
        name: 'markdown',
        citations: true,
        renderer: MagicTextRenderer,
        description: `
          Render Markdown content with links, emphasis, and citation definitions.
          Write all markdown as children and define citations in markdown using:
          [^source-id]: Source title https://example.com
        `,
      }),
      exposeComponent(Heading, {
        name: 'h',
        description:
          'Show a heading to separate sections with configurable level',
        input: {
          text: s.streaming.string('The text to show in the heading'),
          level: s.number(
            'Heading level from 1 (largest) to 6 (smallest); defaults to 2',
          ),
        },
      }),
      exposeComponent(Citation, {
        name: 'blockquote',
        description: 'Highlight a supporting quote or citation',
        input: {
          text: s.streaming.string('The quoted text to display'),
          source: s.streaming.string('Optional source or attribution'),
        },
      }),
      exposeComponent(Chart, {
        name: 'chart',
        description: `
          Visualize insights from the fast-food nutrition dataset. Supports bar,
          line, and pie charts with configurable axes, titles, legends, and
          labels.
        `,
        fallback: ChartGhostLoader,
        input: {
          chart: s.object('Configuration for the fast-food chart', {
            prompt: s.string('Narrative description of the chart to create'),
            chartType: s.anyOf([
              s.enumeration(
                'Optional Chart.js chart type hint (bar, line, pie, etc.)',
                chartTypeHints,
              ),
              s.nullish(),
            ]),
            restaurants: s.array(
              'Optional list of restaurant names to include (leave empty for all)',
              s.string('Restaurant name as listed in the dataset'),
            ),
            menuItems: s.array(
              'Specific menu item ids to focus on (leave empty to ignore)',
              s.string('Menu item id'),
            ),
            categories: s.array(
              'Menu categories to highlight (e.g., Salad, Other); leave empty for all',
              s.string('Category label'),
            ),
            searchTerm: s.anyOf([
              s.string(
                'Free-text filter applied before charting; set to null or omit to skip',
              ),
              s.nullish(),
            ]),
            maxCalories: s.anyOf([
              s.number('Maximum calories to include per item'),
              s.nullish(),
            ]),
            minCalories: s.anyOf([
              s.number('Minimum calories to include per item'),
              s.nullish(),
            ]),
            minProtein: s.anyOf([
              s.number('Minimum protein (grams) to include'),
              s.nullish(),
            ]),
            maxSodium: s.anyOf([
              s.number('Maximum sodium (mg) to include'),
              s.nullish(),
            ]),
            limit: s.anyOf([
              s.number(
                'Maximum number of menu items to fetch (null uses the default limit)',
              ),
              s.nullish(),
            ]),
            sortBy: s.anyOf([
              s.enumeration('Metric used to sort results before charting', [
                'calories',
                'protein',
                'totalFat',
                'sodium',
                'sugar',
              ]),
              s.nullish(),
            ]),
            sortDirection: s.anyOf([
              s.enumeration('Sort direction for the selected metric', [
                'desc',
                'asc',
              ]),
              s.nullish(),
            ]),
          }),
        },
      }),
    ],
  });
}
