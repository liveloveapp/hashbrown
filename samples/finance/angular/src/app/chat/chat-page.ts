import { Component, computed, effect, model, signal } from '@angular/core';
import {
  exposeComponent,
  RenderMessageComponent,
  structuredCompletionResource,
  uiChatResource,
} from '@hashbrownai/angular';
import { prompt, s } from '@hashbrownai/core';
import { FormsModule } from '@angular/forms';
import { Squircle } from '../squircle';
import { searchFastFoodItemsTool } from './tools/search-fast-food-items';
import { Chart } from './elements/chart';
import { Paragraph } from './elements/paragraph';
import { Heading } from './elements/heading';
import { Citation } from './elements/citation';
import { OrderedList } from './elements/ordered-list';
import { UnorderedList } from './elements/unordered-list';
import { LinkClickHandler } from './link-click-handler';

@Component({
  selector: 'app-chat-page',
  imports: [FormsModule, RenderMessageComponent, Squircle],
  providers: [{ provide: LinkClickHandler, useExisting: ChatPage }],
  template: `
    @if (chat.value().length === 0) {
      <div class="initial-chat-state">
        <form (ngSubmit)="sendMessage($event)" appSquircle="16">
          <div
            appSquircle="12"
            appSquircleBorderColor="rgba(0, 0, 0, 0.12)"
            [appSquircleBorderWidth]="2"
          >
            <textarea
              name="user-message"
              [(ngModel)]="input"
              rows="5"
              cols="50"
            ></textarea>
          </div>

          <button type="submit">
            <span class="material-symbols-outlined"> arrow_right_alt </span>
          </button>
        </form>
      </div>
    } @else {
      @let lastAssistantMessage = chat.lastAssistantMessage();
      @if (lastAssistantMessage) {
        <div class="assistant-message">
          <hb-render-message
            class="assistant-message-content"
            [message]="lastAssistantMessage"
          />
        </div>
      }
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
      padding: 16px;

      .assistant-message-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--gray-dark);
        font-family: Fredoka;

        --article-width: 720px;
        --max-article-width: 1200px;

        width: var(--max-article-width);
      }
    }
  `,
})
export class ChatPage implements LinkClickHandler {
  readonly input = model('');
  readonly ephemeralLink = signal<null | string>(null);

  chat = uiChatResource({
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
      - Always begin the response with an <h> component (level defaults to 2)
        that serves as a clear title for the report.
      - Sprinkle inline markdown links throughout the article. Invent fresh,
        descriptive URLs (e.g., /high-protein-wrap or /sodium-ladders) so the
        piece feels like an ephemeral Wikipedia—assume the same system prompt
        generates those pages when clicked. Aim for at least one crafted link
        per paragraph.
      - Use the sources column to cite at least one URL when highlighting
        stand-out items, and mention last_audited dates when freshness matters.
      - Highlight interesting contrasts (e.g., highest protein per 500 calories,
        sodium outliers, salad vs. non-salad categories) when relevant.
      - Start every answer with a short overview paragraph and end with a
        takeaway paragraph that explicitly states what the user should remember.
      - Break the body into ordered sections (<h>, <p>, lists) so the reader can
        skim.
      - Use the provided UI components (<p>, <h2>, <blockquote>, <ol>, <ul>,
        <chart>, etc.) to structure reports. Combine multiple components to
        build rich answers.
      - Use the <chart> component to visualize insights. Supply a descriptive
        prompt plus any filters (restaurants, menu items, categories,
        searchTerm, nutrient limits, limits, sorting) that would help build the
        chart.
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
        <h level="2" text="Subway turkey subs: sodium vs. protein" />
        <p text="Call out the key takeaway grounded in the updated dataset." />
        <chart chart=${{
          prompt:
            'Plot protein against sodium for Subway Market Fresh turkey sandwiches',
          restaurants: ['Subway'],
          menuItems: [],
          categories: ['Turkey'],
          maxCalories: '',
          minCalories: '',
          minProtein: '',
          maxSodium: '',
          sortDirection: 'desc',
          searchTerm: 'turkey',
          limit: '6',
          sortBy: 'protein',
        }} />
        <p text="Summarize what the visualization shows about sodium trade-offs." />
        <chart chart=${{
          prompt:
            'Plot calories per serving for Subway veggie sandwiches vs. wraps',
          restaurants: ['Subway'],
          menuItems: [],
          categories: ['Veggie'],
          maxCalories: '',
          minCalories: '',
          minProtein: '',
          maxSodium: '',
          sortDirection: 'asc',
          searchTerm: 'wrap',
          limit: '6',
          sortBy: 'calories',
        }} />
      </ui>
    `,
    tools: [searchFastFoodItemsTool],
    components: [
      exposeComponent(Paragraph, {
        name: 'p',
        description: `
          Render a rich Magic Text paragraph with animated reveal, inline markdown (bold, italic),
          auto-numbered citations, and sanitized links. Links never navigate—clicks are intercepted
          and logged for safety.

          Examples:
          - **Headline:** _Give the TL;DR_ in bold + italics for emphasis.
          - Compare nutrients: 'Protein hits **42 g** while sodium stays under _720 mg_.'
          - Cite sources inline like [Source PDF](https://example.com) and add [^doe2024] markers.
        `,
        input: {
          text: s.streaming.string('The text to show in the paragraph'),
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
        description: 'Display a numbered list',
        input: {
          items: s.streaming.array(
            'The ordered list entries',
            s.streaming.string('The content of a single list entry'),
          ),
        },
      }),
      exposeComponent(UnorderedList, {
        name: 'ul',
        description: 'Display a bulleted list',
        input: {
          items: s.streaming.array(
            'The unordered list entries',
            s.streaming.string('The content of a single list entry'),
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
            searchTerm: s.string(
              'Free-text filter applied before charting; leave blank to omit',
            ),
            maxCalories: s.string(
              'Maximum calories to include per item (blank string to ignore)',
            ),
            minCalories: s.string(
              'Minimum calories to include per item (blank string to ignore)',
            ),
            minProtein: s.string(
              'Minimum protein (grams) to include (blank string to ignore)',
            ),
            maxSodium: s.string(
              'Maximum sodium (mg) to include (blank string to ignore)',
            ),
            limit: s.string(
              'Maximum number of menu items to fetch (blank string uses default)',
            ),
            sortBy: s.enumeration(
              'Metric used to sort results before charting',
              ['', 'calories', 'protein', 'totalFat', 'sodium', 'sugar'],
            ),
            sortDirection: s.enumeration(
              'Sort direction for the selected metric',
              ['', 'desc', 'asc'],
            ),
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
    input: computed(() => {
      const link = this.ephemeralLink();
      const articleContent = this.chat.lastAssistantMessage()?.content;

      if (!link || !articleContent) {
        return null;
      }

      console.log('link', link, articleContent);

      return {
        link,
        articleContent,
      };
    }),
    schema: s.object('The Result', {
      description: s.string('The description of the content of the page'),
    }),
  });

  constructor() {
    const ephemeralLinkDescription = computed(() => {
      const result = this.ephemeralLinkGenerator.value();
      if (result) {
        return result.description;
      }
      return null;
    });

    effect(() => {
      const description = ephemeralLinkDescription();
      if (description) {
        this.ephemeralLink.set(null);
        this.chat.sendMessage({ role: 'user', content: description });
      }
    });
  }

  sendMessage($formSubmitEvent: SubmitEvent) {
    $formSubmitEvent.preventDefault();
    const input = this.input();

    if (input.trim()) {
      this.chat.sendMessage({ role: 'user', content: input });
      this.input.set('');
    }
  }

  onClickLink(url: string) {
    this.chat.sendMessage({
      role: 'user',
      content: `
      the user clicked the following link from your previous message: ${url}. 
      
      Generate the article content for the link  
    `,
    });
  }
}
