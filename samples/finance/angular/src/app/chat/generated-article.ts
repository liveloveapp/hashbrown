import { Component, input } from '@angular/core';
import {
  exposeComponent,
  RenderMessageComponent,
  structuredCompletionResource,
  uiCompletionResource,
} from '@hashbrownai/angular';
import { prompt, s } from '@hashbrownai/core';
import { searchFastFoodItemsTool } from './tools/search-fast-food-items';
import { Chart } from './elements/chart';
import { ExecutiveSummary } from './elements/executive-summary';
import { Paragraph } from './elements/paragraph';
import { Heading } from './elements/heading';
import { Citation } from './elements/citation';
import { OrderedList } from './elements/ordered-list';
import { UnorderedList } from './elements/unordered-list';
import { LinkClickHandler } from './link-click-handler';
import type { ChartType } from 'chart.js';
import { HorizontalRule } from './elements/hr';
import { Article } from './agents/article-agent';

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

@Component({
  selector: 'app-generated-article',
  imports: [RenderMessageComponent],
  providers: [{ provide: LinkClickHandler, useExisting: GeneratedArticle }],
  template: `
    @let article = chat.value();
    @if (!article) {
      Generating article...
    } @else {
      <div class="assistant-message">
        <hb-render-message
          class="assistant-message-content"
          [message]="article"
        />
      </div>
    }
  `,
  styles: `
    .initial-chat-state {
      padding: 24px;
      width: 100%;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;

      form {
        background-color: white;
        display: flex;
        flex-direction: row;
        gap: 8px;
        align-items: center;
        justify-content: center;
        padding: 8px;
      }

      textarea {
        border: none;
        outline: none;
        background-color: transparent;
        padding: 8px;
      }

      button {
        background-color: transparent;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 1px solid var(--sky-blue);
        cursor: pointer;
        transition: background-color 0.2s ease;
        color: var(--chocolate-brown);

        &:hover {
          background-color: var(--sky-blue);
        }
      }
    }

    .assistant-message {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 0 16px;

      .assistant-message-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--gray-dark);
        font-family: Fredoka;

        --article-width: 720px;
        --max-article-width: 960px;

        width: var(--max-article-width);
      }
    }
  `,
})
export class GeneratedArticle {
  readonly article = input.required<Article>();

  chat = uiCompletionResource({
    model: 'gpt-5-chat-latest',
    debugName: 'finance-chat',
    system: prompt`
      You are a culinary insights analyst helping users explore an expanded
      fast-food nutrition dataset stored in
      samples/finance/angular/public/fastfood_v2.csv. Each row contains the
      chain name, the full menu_item label, a short_name alias, human-friendly
      description, serving_size text, pipe-delimited categories, macronutrients
      (calories, total_fat_g, saturated_fat_g, trans_fat_g, cholesterol_mg,
      sodium_mg, carbs_g, fiber_g, sugar_g, protein_g), plus the sources (pipe of
      URLs) and a last_audited ISO timestamp. This dataset is the only source of
      truth—never invent values that are not present in the file.

      Use the "searchFastFoodItems" tool whenever you need to identify menu
      items, fetch their ids, or filter by nutrients and restaurants before
      drawing conclusions. Call it before making claims about specific items or
      categories.

      When responding:
      - Root every statement in the dataset and reference chain + menu_item (or
        short_name) names.
      - Include the serving_size and at least one category tag the first time
        you mention a menu item so readers understand portion context.
      - Quote nutrients with explicit units (grams or milligrams) and weave in
        notable description details from the CSV.
      - The dataset does not include pricing or marketing information. You cannot
        make any claims about pricing or marketing.
      - Open every response with an <h> component configured with level="1" so
        the report always begins with a strong title.
      - Follow the heading immediately with an <executive-summary> component
        that surfaces the top insights in 1-2 sentences rooted in the dataset,
        followed by an <hr> component to separate the summary from the rest of 
        the article.
      - Sprinkle inline markdown links throughout the article, always using the
        "[anchor text](/custom-slug)" format so links render with parentheses.
        Invent fresh, descriptive URLs (e.g., /article/high-protein-wraps-at-subway or
        /article/sodium-ladders) so the piece feels like an ephemeral
        Wikipedia—assume the same system prompt generates those pages when
        clicked. Aim for at least one crafted link per paragraph.
      - Use the sources column to cite at least one URL when highlighting
        stand-out items, and mention last_audited dates when freshness matters.
      - Inline citations as [^1] markers in each paragraph (multiple when insights 
        draw from more than one source) and immediately push the following object
        { id: 1, url: 'https://example.com/source' } into that paragraph's
        \`citations\` array so references stay in sync while streaming.
      - Highlight interesting contrasts (e.g., highest protein per 500 calories,
        sodium outliers, salad vs. non-salad categories) when relevant.
      - After the summary, include a short overview paragraph via <p> and end
        with a takeaway paragraph that explicitly states what the user should
        remember.
      - Break the body into ordered sections (<h>, <p>, lists) so the reader can
        skim.
      - Use the provided UI components (<p>, <h2>, <blockquote>, <ol>, <ul>,
        <chart>, etc.) to structure reports. Combine multiple components to
        build rich answers.
      - Use the <chart> component to visualize insights. Supply a descriptive
        prompt plus any filters (restaurants, menu items, categories,
        searchTerm, nutrient limits, limits, sorting) that would help build the
        chart, and set \`chartType\` to whichever Chart.js visualization
        (bar/line/pie/etc.) best communicates the story.
      - Never stop after a single visualization when the user asks for
        comparisons, multiple angles, or plural "charts". In ambiguous cases,
        default to at least two distinct charts (e.g., one for each chain or
        metric) before concluding.
      - After inserting each <chart>, add a follow-up paragraph interpreting the
        visualization so the user knows what changed.
      - Before closing, confirm that every sub-question was addressed; if not,
        continue generating additional sections/charts until the entire request
        is satisfied.

      Today's date is ${new Date().toISOString()}.

      Example structure:
      <ui>
        <h level="1" text="Subway turkey subs: sodium vs. protein" />
        <executive-summary
          text="Highlight the biggest surprise from the latest fastfood_v2.csv refresh and why it matters for diners."
        />
        <hr />
        <p
          text="Call out how Subway's turkey sub keeps protein high while sodium stays moderate, referencing the fastfoodnutrition.org breakout in [^1] and validating availability on Subway's own menu page. [^2]"
          citations=${[
            { id: '1', url: 'https://fastfoodnutrition.org/subway/turkey-sub' },
            { id: '2', url: 'https://www.subway.com/en-us/menu' },
          ]}
        />
        <chart chart=${{
          chartType: 'scatter',
          prompt:
            'Plot protein against sodium for Subway Market Fresh turkey sandwiches',
          restaurants: ['Subway'],
          menuItems: [],
          categories: ['Turkey'],
          maxCalories: null,
          minCalories: null,
          minProtein: null,
          maxSodium: null,
          sortDirection: 'desc',
          searchTerm: 'turkey',
          limit: 6,
          sortBy: 'protein',
        }} />
        <p text="Summarize what the visualization shows about sodium trade-offs." citations=${[]} />
        <chart chart=${{
          chartType: 'bar',
          prompt:
            'Plot calories per serving for Subway veggie sandwiches vs. wraps',
          restaurants: ['Subway'],
          menuItems: [],
          categories: ['Veggie'],
          maxCalories: null,
          minCalories: null,
          minProtein: null,
          maxSodium: null,
          sortDirection: 'asc',
          searchTerm: 'wrap',
          limit: 6,
          sortBy: 'calories',
        }} />
      </ui>
    `,
    input: this.article,
    tools: [searchFastFoodItemsTool],
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
        input: {
          chart: s.streaming.object('Configuration for the fast-food chart', {
            prompt: s.string('Narrative description of the chart to create'),
            chartType: s.anyOf([
              s.enumeration(
                'Optional Chart.js chart type hint (bar, line, pie, etc.)',
                chartTypeHints,
              ),
              s.nullish(),
            ]),
            restaurants: s.streaming.array(
              'Optional list of restaurant names to include (leave empty for all)',
              s.string('Restaurant name as listed in the dataset'),
            ),
            menuItems: s.streaming.array(
              'Specific menu item ids to focus on (leave empty to ignore)',
              s.string('Menu item id'),
            ),
            categories: s.streaming.array(
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
          }) as any,
        },
      }),
    ],
  });

  readonly ephemeralLinkGenerator = structuredCompletionResource({
    model: 'gpt-5-nano',
    system: `
      You route clicks on ephemeral fast-food knowledge links. Each request
      includes:
      - link: the URL that was clicked (string)
      - articleContent: the original article body that contained the link

      Produce a concise, first-person imperative brief that the main finance
      chat analyst can use to generate the new article. Each brief must:
      1. Reference the clicked link text/slug so the new page has a title hook.
      2. Mention which chains, menu items, or nutrient angles to explore based
         on clues in articleContent.
      3. Remind the analyst to keep sourcing from fastfood_v2.csv.
      4. Stay under 3 sentences.

      Example 1:
      Input link: /protein-ladders
      Context snippet: "...compare Chick-fil-A grilled nuggets to Subway wraps in
      our [protein ladder playbook](...) for lean bulking..."
      Output: "Draft a 'Protein Ladder Playbook' deep dive comparing Chick-fil-A
      grilled nuggets against Subway wraps, quantifying protein per calorie from
      fastfood_v2.csv and recommending lean-bulk swaps."

      Example 2:
      Input link: /sodium-buffers
      Context snippet: "...use our sodium stability hub to see how Panera soups
      stack up against Taco Bell bowls..."
      Output: "Create a 'Sodium Stability Hub' brief mapping Panera soups vs.
      Taco Bell bowls, highlighting mg of sodium per serving and listing lower
      sodium alternatives using fastfood_v2.csv."
    `,
    input: this.article,
    schema: s.object('The Result', {
      description: s.string('The description of the content of the page'),
    }),
  });
}
