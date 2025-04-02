import { Scene } from '../../../models/scene.model';
import { createActionGroup, props } from '@ngrx/store';

export const PredictionsAiActions = createActionGroup({
  source: 'Predictions AI',
  events: {
    'Add Light': props<{ light: { name: string; brightness: number } }>(),
    'Add Scene': props<{ scene: Omit<Scene, 'id'> }>(),
    'Add Light To Scene': props<{
      lightId: string;
      sceneId: string;
      brightness: number;
    }>(),
    'Remove Light From Scene': props<{
      lightId: string;
      sceneId: string;
    }>(),
    'Schedule Scene': props<{
      sceneId: string;
      datetime: string;
    }>(),
    'Apply Scene': props<{ sceneId: string }>(),
  },
});
