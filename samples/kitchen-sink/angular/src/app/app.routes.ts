import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
  },
  {
    path: 'lights',
    loadComponent: () =>
      import('./features/lights/lights.component').then(
        (m) => m.LightsComponent,
      ),
  },
  {
    path: 'lights/add',
    loadComponent: () =>
      import('./features/lights/light-form.component').then(
        (m) => m.LightFormComponent,
      ),
  },
  {
    path: 'lights/:id/edit',
    loadComponent: () =>
      import('./features/lights/light-form.component').then(
        (m) => m.LightFormComponent,
      ),
  },
  {
    path: 'scenes',
    loadComponent: () =>
      import('./features/scenes/scenes.component').then(
        (m) => m.ScenesComponent,
      ),
  },
  {
    path: 'scheduled-scenes',
    loadComponent: () =>
      import('./pages/scheduled-scenes/scheduled-scenes.component').then(
        (m) => m.ScheduledScenesComponent,
      ),
  },
  {
    path: 'planner',
    loadComponent: () =>
      import('./features/planner/planner.component').then(
        (m) => m.PlannerComponent,
      ),
  },
];
