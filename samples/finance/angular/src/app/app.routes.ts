import { Route } from '@angular/router';
import { ChartPage } from './chart/ChartPage';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: 'chart',
    pathMatch: 'full',
  },
  {
    path: 'chart',
    component: ChartPage,
  },
];
