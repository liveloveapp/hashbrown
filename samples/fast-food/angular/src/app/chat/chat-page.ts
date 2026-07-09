import {
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
} from '@angular/core';
import {
  RenderMessageComponent,
  structuredCompletionResource,
  uiCompletionResource,
} from '@hashbrownai/angular';
import { prompt, s } from '@hashbrownai/core';
import { FormsModule } from '@angular/forms';
import { Squircle } from '../squircle';
import { searchFastFoodItemsTool } from './tools/search-fast-food-items';
import { LinkClickHandler } from './link-click-handler';
import { ChatKit } from './chat-kit';

@Component({
  selector: 'app-chat-page',
  imports: [FormsModule, RenderMessageComponent, Squircle],
  providers: [{ provide: LinkClickHandler, useExisting: ChatPage }],
  template: `
    @let article = chat.value();
    @if (!article) {
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
export class ChatPage implements LinkClickHandler {
  readonly input = model('');
  readonly ephemeralLink = signal<null | string>(null);
  private readonly completionPrompt = signal<string | null>(null);
  readonly chatKit = inject(ChatKit);

  chat = uiCompletionResource({
    model: 'gpt-5-chat-latest',
    debugName: 'fast-food-chat',
    system: prompt`
      You are a culinary insights analyst helping users explore an expanded
      fast-food nutrition dataset stored in
      samples/fast-food/angular/public/fastfood_v2.csv. Each row contains the
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
      - Open every response with an <h> component configured with level="1" so
        the report always begins with a strong title.
      - Follow the heading immediately with an <executive-summary> component
        that surfaces the top insights in 1-2 sentences rooted in the dataset,
        followed by an <hr> component to separate the summary from the rest of 
        the article.
      - Sprinkle inline markdown links throughout the article, always using the
        "[anchor text](/custom-slug)" format so links render with parentheses.
        Invent fresh, descriptive URLs (e.g., /?prompt=high-protein-wraps-at-subway or
        /?prompt=sodium-ladders) so the piece feels like an ephemeral
        Wikipedia—assume the same system prompt generates those pages when
        clicked. Aim for at least one crafted link per paragraph.
      - Use the sources column to cite at least one URL when highlighting
        stand-out items, and mention last_audited dates when freshness matters.
      - Inline citations as [^source-id] markers, then define each source in
        markdown using this format:
        [^source-id]: Source title https://example.com/source
      - Highlight interesting contrasts (e.g., highest protein per 500 calories,
        sodium outliers, salad vs. non-salad categories) when relevant.
      - After the summary, include a short overview paragraph via <markdown children="..." /> and end
        with a takeaway paragraph that explicitly states what the user should
        remember.
      - Break the body into ordered sections (<h>, <markdown children="..." />) so the reader can
        skim.
      - Use the provided UI components (<h>, <executive-summary>, <hr>,
        <markdown children="..." />, <blockquote>, <chart>) to structure reports. Use markdown
        bullets/numbered lists inside markdown children when you need lists.
      - Combine multiple components to
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
        <markdown children=${`
          Call out how Subway's turkey sub keeps protein high while sodium stays
          moderate, referencing the fastfoodnutrition.org breakout in [^subway]
          and validating availability on Subway's own menu page. [^menu]

          [^subway]: Subway turkey nutrition breakdown https://fastfoodnutrition.org/subway/turkey-sub
          [^menu]: Subway official menu https://www.subway.com/en-us/menu
        `} />
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
        <markdown children="Summarize what the visualization shows about sodium trade-offs." />
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
    input: this.completionPrompt,
    tools: [searchFastFoodItemsTool],
    components: [this.chatKit.kit],
  });

  readonly ephemeralLinkGenerator = structuredCompletionResource({
    model: 'gpt-5-nano',
    system: `
      You route clicks on ephemeral fast-food knowledge links. Each request
      includes:
      - link: the URL that was clicked (string)
      - articleContent: the original article body that contained the link

      Produce a concise, first-person imperative brief that the main fast-food
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
      const articleContent = this.chat.value()?.content;

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
        this.requestArticle(description);
      }
    });
  }

  sendMessage($formSubmitEvent: SubmitEvent) {
    $formSubmitEvent.preventDefault();
    const input = this.input();

    const trimmed = input.trim();
    if (trimmed) {
      this.requestArticle(trimmed);
      this.input.set('');
    }
  }

  onClickLink(url: string) {
    this.requestArticle(
      `
      the user clicked the following link from your previous message: ${url}. 
      
      Generate the article content for the link  
    `.trim(),
    );
  }

  private requestArticle(promptText: string) {
    const normalized = promptText.trim();
    if (!normalized) {
      return;
    }

    this.completionPrompt.set(null);
    this.completionPrompt.set(normalized);
  }
}
