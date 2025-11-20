import { signalStore, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import { withResource } from '@angular-architects/ngrx-toolkit';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

export interface Article {
  id: string;
  slug: string;
  prompt: string;
}

export interface ArticleState {
  partialArticle: Partial<Article> | null;
}

const ArticleGeneratorAgent = signalStore(
  withEntities<Article>(),
  withState<ArticleState>({
    partialArticle: null,
  }),
  withResource((state) => {
    return structuredCompletionResource({
      model: 'gpt-5.1',
      input: state.partialArticle,
      schema: s.object('The Article', {
        slug: s.string('The slug of the article'),
        prompt: s.string('The prompt of the article'),
      }),
      system: `
        You are an agent that generates descriptions for
        articles based on a prompt. 

        The articles are for a CSV dataset that contains information
        about fast food items. 

        You will be given part of the article. You must complete
        the article.
      `,
    });
  }),
);
