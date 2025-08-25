import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Scene } from '../../../models/scene.model';

export const ScenesPageActions = createActionGroup({
  source: 'Scenes Page',
  events: {
    'Open Scene Dialog': props<{ scene?: Scene }>(),
    'Close Scene Dialog': emptyProps(),
    Enter: emptyProps(),
    'Add Scene': props<{ scene: Omit<Scene, 'id'> }>(),
    'Update Scene': props<{ id: string; scene: Partial<Scene> }>(),
    'Delete Scene': props<{ id: string }>(),
    'Apply Scene': props<{ id: string }>(),
  },
});
