import { Route } from '@angular/router';
import { ChartPage } from './chart/ChartPage';
import { ChatPage } from './chat/chat-page';
import { ArticlePage } from './chat/article-page';

export const appRoutes: Route[] = [
  {
    path: '',
    component: ChartPage,
  },
  {
    path: 'chat',
    component: ChatPage,
  },
  {
    path: 'article/:slug',
    component: ArticlePage,
  },
];
