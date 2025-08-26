import { createActionGroup, props } from '@ngrx/store';
import { Light } from '../../../models/light.model';
import { Scene } from '../../../models/scene.model';

export const DashboardApiActions = createActionGroup({
  source: 'Dashboard API',
  events: {
    'Load Home State Success': props<{ lights: Light[]; scenes: Scene[] }>(),
    'Load Home State Failure': props<{ error: string }>(),
  },
});
