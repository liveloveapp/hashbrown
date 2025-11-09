import { Component, model } from '@angular/core';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { FormsModule } from '@angular/forms';
import { Squircle } from '../squircle';
import { searchFastFoodItemsTool } from './tools/search-fast-food-items';
import { Chart } from './elements/chart';
import { Paragraph } from './elements/paragraph';
import { Heading } from './elements/heading';
import { Citation } from './elements/citation';
import { OrderedList } from './elements/ordered-list';
import { UnorderedList } from './elements/unordered-list';

@Component({
  selector: 'app-chat-page',
  imports: [FormsModule, RenderMessageComponent, Squircle],
  template: `
    <div>
      <h1>Chat</h1>

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
        @for (message of chat.value(); track $index) {
          @switch (message.role) {
            @case ('user') {
              <div class="user-message">{{ message.content }}</div>
            }
            @case ('assistant') {
              <div class="assistant-message">
                <hb-render-message
                  class="assistant-message-content"
                  [message]="message"
                />
              </div>
            }
          }
        }
      }
    </div>
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
export class ChatPage {
  readonly input = model('');
  chat = uiChatResource({
    model: 'gpt-5-chat-latest',
    system: `
      You are a culinary insights analyst helping users explore a fast-food
      nutrition dataset stored in samples/finance/angular/public/fastfood.csv.
      Each row contains the restaurant name, menu item, calories, calories from
      fat, total fat (g), saturated fat (g), trans fat (g), cholesterol (mg),
      sodium (mg), total carbs (g), fiber (g), sugar (g), protein (g), vitamin A
      (% daily value), vitamin C (% daily value), calcium (% daily value), and a
      menu category flag. This dataset is the only source of truth—never invent
      values that are not present in the file.

      Use the "searchFastFoodItems" tool whenever you need to identify menu
      items, fetch their ids, or filter by nutrients and restaurants before
      drawing conclusions. Call it before making claims about specific items or
      categories.

      When responding:
      - Root every statement in the dataset and reference restaurant + item
        names.
      - Always include measurement units (grams, milligrams, or % daily value)
        when citing nutrients.
      - Highlight interesting contrasts (e.g., highest protein per 500 calories,
        sodium outliers, salad vs. non-salad items) when relevant to the prompt.
      - Use the provided UI components (<p>, <h2>, <blockquote>, <ol>, <ul>,
        <chart>, etc.) to structure reports. Combine multiple components to
        build rich answers.
      - Use the <chart> component to visualize insights. Supply a descriptive
        prompt plus any filters (restaurants, menu items, categories,
        searchTerm, nutrient limits, limits, sorting) that would help build the
        chart.

      Today's date is ${new Date().toISOString()}.

      Example structure:
      <ui>
        <h2 text="McDonald's chicken: protein vs. calories" />
        <p>Call out the key takeaway grounded in the dataset.</p>
        <chart prompt="Plot protein against calories for McDonald's chicken sandwiches" restaurants="${['Mcdonalds']}" searchTerm="chicken" limit="6" sortBy="protein" />
        <p>Summarize what the chart shows and what trade-offs exist.</p>
      </ui>
    `,
    tools: [searchFastFoodItemsTool],
    components: [
      exposeComponent(Paragraph, {
        name: 'p',
        description: 'Show a paragraph',
        input: {
          text: s.streaming.string('The text to show in the paragraph'),
        },
      }),
      exposeComponent(Heading, {
        name: 'h2',
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
            restaurants: s.anyOf([
              s.streaming.array(
                'Optional list of restaurant names to include',
                s.string('Restaurant name as listed in the dataset'),
              ),
              s.nullish(),
            ]),
            menuItems: s.anyOf([
              s.streaming.array(
                'Specific menu item ids to focus on (from searchFastFoodItems)',
                s.string('Menu item id'),
              ),
              s.nullish(),
            ]),
            categories: s.anyOf([
              s.streaming.array(
                'Menu categories to highlight (e.g., Salad, Other)',
                s.string('Category label'),
              ),
              s.nullish(),
            ]),
            searchTerm: s.anyOf([
              s.string('Free-text filter applied before charting'),
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
              s.number('Maximum number of menu items to fetch (defaults to 25)'),
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
                'asc',
                'desc',
              ]),
              s.nullish(),
            ]),
          }),
        },
      }),
    ],
  });

  sendMessage($formSubmitEvent: SubmitEvent) {
    $formSubmitEvent.preventDefault();
    const input = this.input();

    if (input.trim()) {
      this.chat.sendMessage({ role: 'user', content: input });
      this.input.set('');
    }
  }
}
