import { structuredCompletionResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { Component, effect, input, output } from '@angular/core';
import { searchFastFoodItemsTool } from '../tools/search-fast-food-items';

export interface Article {
  slug: string;
  shortTitle: string;
  prompt: string;
  facts: {
    fact: string;
    sources: string[];
  }[];
}

const articleSchema = s.object('The Article', {
  type: s.literal('article'),
  slug: s.string('The slug of the article'),
  shortTitle: s.string('The short title of the article'),
  prompt: s.string('The prompt of the article'),
  facts: s.array(
    'The facts',
    s.object('The fact', {
      fact: s.string('The fact'),
      sources: s.array('The sources', s.string('The source URL.')),
    }),
  ),
});

const errorSchema = s.object('The Error', {
  type: s.literal('error'),
  message: s.string('The error message'),
});

const resultSchema = s.object('The Result', {
  result: s.anyOf([articleSchema, errorSchema]),
});

@Component({
  selector: 'app-article-agent',
  template: `
    @if (agent.isSending()) {
      Thinking...
    }
    @if (agent.isReceiving()) {
      Generating article definition...
    } @else if (agent.error()) {
      Error generating article: {{ agent.error() }}
    } @else {
      All done!

      <pre>{{ article() }}</pre>
    }
  `,
})
export class ArticleAgent {
  readonly article = input.required<Partial<Article>>();
  readonly complete = output<Article>();
  readonly error = output<string>();

  protected agent = structuredCompletionResource({
    model: 'gpt-5.1',
    input: this.article,
    schema: resultSchema,
    tools: [searchFastFoodItemsTool],
    system: `
      You are a research agent that generates a description of an
      article about fast food nutrition. 

      You will be given some details about the article, like the prompt
      or the slug. You must then use the "searchFastFoodItems" tool to
      research facts that support the article.

      Once you have found the facts, you will generate the article, including:
       - The URL slug for the article
       - The short title for the article
       - The prompt for the article
       - The facts that support the article

      The facts should be in the following format:
      {
        fact: string;
        sources: string[];
      }

      The sources should be the URLs of the sources that support the fact.
    `,
  });

  constructor() {
    effect(() => {
      const value = this.agent.value();
      const error = this.agent.error();
      const input = this.article();

      console.log('value', value);
      console.log('error', error);
      console.log('input', input);

      if (value) {
        if (value.result.type === 'article') {
          this.complete.emit({
            facts: value.result.facts,
            prompt: value.result.prompt,
            shortTitle: value.result.shortTitle,
            slug: value.result.slug,
          });
        } else {
          this.error.emit(value.result.message);
        }
      } else if (error) {
        this.error.emit(error.message);
      }
    });
  }
}
