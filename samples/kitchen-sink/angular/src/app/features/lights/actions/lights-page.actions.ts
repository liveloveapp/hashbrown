import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Light } from '../../../models/light.model';

export const LightsPageActions = createActionGroup({
  source: 'Lights Page',
  events: {
    Enter: emptyProps(),
    'Add Light': props<{ light: Omit<Light, 'id' | 'brightness'> }>(),
    'Update Light': props<{ id: string; changes: Partial<Light> }>(),
    'Delete Light': props<{ id: string }>(),
  },
});
