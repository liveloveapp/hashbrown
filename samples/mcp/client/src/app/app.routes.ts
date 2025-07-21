import { Route } from '@angular/router';
import { ProjectsComponent } from './projects/projects';
import { AuthComponent } from './auth';

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
  {
    path: 'auth',
    component: AuthComponent,
  },
];
