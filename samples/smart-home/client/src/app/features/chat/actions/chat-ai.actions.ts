import { createActionGroup, props } from '@ngrx/store';
import { Scene } from '../../../models/scene.model';
import { Light } from '../../../models/light.model';

export const ChatAiActions = createActionGroup({
  source: 'Chat AI',
  events: {
    'Control Light': props<{ lightId: string; brightness: number }>(),
    'Apply Scene': props<{ scene: Scene }>(),
    'Add Scene': props<{ scene: Scene }>(),
    'Add Light': props<{ light: Light }>(),
  },
});
