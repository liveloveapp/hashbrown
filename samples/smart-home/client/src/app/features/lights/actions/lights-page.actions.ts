import { Light } from '../../../models/light.model';
import { createActionGroup, props, emptyProps } from '@ngrx/store';

export const LightsPageActions = createActionGroup({
  source: 'Lights Page',
  events: {
    Enter: emptyProps(),
    'Add Light': props<{ light: Omit<Light, 'id' | 'brightness'> }>(),
    'Update Light': props<{ id: string; changes: Partial<Light> }>(),
    'Delete Light': props<{ id: string }>(),
  },
});
