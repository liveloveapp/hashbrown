import { createActionGroup, props } from '@ngrx/store';
import { Light } from '../../../models/light.model';

export const LightsApiActions = createActionGroup({
  source: 'Lights API',
  events: {
    'Load Lights Success': props<{ lights: Light[] }>(),
    'Load Lights Failure': props<{ error: string }>(),
    'Create Light Success': props<{ light: Light }>(),
    'Create Light Failure': props<{ error: string }>(),
    'Update Light Success': props<{ light: Light }>(),
    'Update Light Failure': props<{ error: string }>(),
    'Delete Light Success': props<{ id: string }>(),
    'Delete Light Failure': props<{ error: string }>(),
    'Control Light Success': props<{ light: Light }>(),
    'Control Light Failure': props<{ error: string }>(),
  },
});
