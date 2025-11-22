import { signalStore, withState } from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';

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
);
