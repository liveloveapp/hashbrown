import { createActionGroup, props } from '@ngrx/store';
import { Scene } from '../../../models/scene.model';

export const ChatAiActions = createActionGroup({
  source: 'Chat AI',
  events: {
    'Control Light': props<{ lightId: string; brightness: number }>(),
    'Apply Scene': props<{ scene: Scene }>(),
  },
});
