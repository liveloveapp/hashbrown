import { Route } from '@angular/router';
import { ProjectsComponent } from './projects/projects';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: 'projects',
    pathMatch: 'full',
  },
  {
    path: 'projects',
    component: ProjectsComponent,
  },
];
