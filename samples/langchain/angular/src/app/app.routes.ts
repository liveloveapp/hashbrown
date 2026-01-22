import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'langgraph',
  },
  {
    path: 'langgraph',
    loadComponent: () =>
      import('./langgraph/langgraph.component').then(
        (m) => m.LanggraphComponent,
      ),
  },
];
