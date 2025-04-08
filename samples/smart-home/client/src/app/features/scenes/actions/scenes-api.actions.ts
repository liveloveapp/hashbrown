import { createActionGroup, props } from '@ngrx/store';
import { Scene, SceneLight } from '../../../models/scene.model';

export const ScenesApiActions = createActionGroup({
  source: 'Scenes API',
  events: {
    'Load Scenes Success': props<{ scenes: Scene[] }>(),
    'Load Scenes Failure': props<{ error: string }>(),

    'Add Scene Success': props<{ scene: Scene }>(),
    'Add Scene Failure': props<{ error: string }>(),

    'Update Scene Success': props<{ scene: Scene }>(),
    'Update Scene Failure': props<{ error: string }>(),

    'Delete Scene Success': props<{ id: string }>(),
    'Delete Scene Failure': props<{ error: string }>(),

    'Apply Scene Success': props<{ scene: Scene }>(),
    'Apply Scene Failure': props<{ error: string }>(),

    'Add Light To Scene Success': props<{
      sceneLight: SceneLight;
      sceneId: string;
    }>(),
    'Add Light To Scene Failure': props<{ error: string }>(),
  },
});
