import { ChartType } from 'chart.js';
import { Injectable } from '@angular/core';
import { s } from '@hashbrownai/core';
import { createUiKit, exposeComponent } from '@hashbrownai/angular';
import { ExecutiveSummary } from './elements/executive-summary';
import { HorizontalRule } from './elements/hr';
import { Paragraph } from './elements/paragraph';
import { Heading } from './elements/heading';
import { Citation } from './elements/citation';
import { OrderedList } from './elements/ordered-list';
import { UnorderedList } from './elements/unordered-list';
import { Chart } from './elements/chart';
import { ChartGhostLoader } from './elements/chart-ghost-loader';

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
      exposeComponent(Paragraph, {
        name: 'p',
        description: `
          Render a rich Magic Text paragraph with inline markdown (bold, italic), auto-numbered
          citations, and links.

          Examples:
          - **Headline:** _Give the TL;DR_ in bold + italics for emphasis.
          - Compare nutrients: 'Protein hits **42 g** while sodium stays under _720 mg_.'
          - Cite sources inline like [^1] and put the URL in the citations array.
        `,
        input: {
          text: s.streaming.string('The text to show in the paragraph'),
          citations: s.streaming.array(
            'The citations to show in the paragraph',
            s.object('The citation', {
              id: s.string('The number of the citation'),
              url: s.string('The URL of the citation'),
            }),
          ),
        },
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
      exposeComponent(OrderedList, {
        name: 'ol',
        description:
          'Display a numbered list. Provide the shared citations array just like paragraphs so inline markers render consistently.',
        input: {
          items: s.streaming.array(
            'The ordered list entries',
            s.streaming.string('The content of a single list entry'),
          ),
          citations: s.streaming.array(
            'The citations to show in the list (reused for each entry)',
            s.object('The citation', {
              id: s.string('The number of the citation'),
              url: s.string('The URL of the citation'),
            }),
          ),
        },
      }),
      exposeComponent(UnorderedList, {
        name: 'ul',
        description:
          'Display a bulleted list. Supply a shared citations array to keep numbering in sync with paragraphs.',
        input: {
          items: s.streaming.array(
            'The unordered list entries',
            s.streaming.string('The content of a single list entry'),
          ),
          citations: s.streaming.array(
            'The citations to show in the list (reused for each entry)',
            s.object('The citation', {
              id: s.string('The number of the citation'),
              url: s.string('The URL of the citation'),
            }),
          ),
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
