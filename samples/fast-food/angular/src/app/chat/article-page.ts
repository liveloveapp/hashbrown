import { Component, computed, input, resource } from '@angular/core';
import { Article, ArticleAgent } from './agents/article-agent';
import { GeneratedArticle } from './generated-article';

const ARTICLE_RESOURCE_KEY = 'article';

@Component({
  selector: 'app-article-page',
  imports: [GeneratedArticle, ArticleAgent],
  template: `
    @if (!article()) {
      <app-article-agent
        [article]="partialArticle()!"
        (complete)="onArticleGenerated($event)"
      />
    } @else {
      <app-generated-article [article]="article()!" />
    }
  `,
  providers: [ArticleAgent],
})
export class ArticlePage {
  readonly slug = input.required<string>();
  readonly partialArticle = computed(() => {
    const slug = this.slug();

    if (!slug) return null;

    return { slug };
  });

  readonly articleResource = resource({
    params: this.slug,
    loader: async ({ params: slug }): Promise<Article | null> => {
      const key = `${ARTICLE_RESOURCE_KEY}:${slug}`;
      const article = localStorage.getItem(key);
      if (article) {
        return JSON.parse(article);
      }

      return null;
    },
  });

  readonly article = computed(() => {
    if (this.articleResource.hasValue()) {
      return this.articleResource.value();
    }

    return null;
  });

  onArticleGenerated(article: Article) {
    const key = `${ARTICLE_RESOURCE_KEY}:${article.slug}`;
    localStorage.setItem(key, JSON.stringify(article));
    this.articleResource.reload();
  }
}
