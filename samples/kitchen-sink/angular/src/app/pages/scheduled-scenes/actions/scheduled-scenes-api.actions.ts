import { createActionGroup, props } from '@ngrx/store';
import { ScheduledScene } from '../../../models/scheduled-scene.model';

export const ScheduledScenesApiActions = createActionGroup({
  source: 'Scheduled Scenes API',
  events: {
    'Load Scheduled Scenes Success': props<{
      scheduledScenes: ScheduledScene[];
    }>(),
    'Load Scheduled Scenes Failure': props<{ error: string }>(),

    'Add Scheduled Scene Success': props<{ scheduledScene: ScheduledScene }>(),
    'Add Scheduled Scene Failure': props<{ error: string }>(),

    'Update Scheduled Scene Success': props<{
      scheduledScene: ScheduledScene;
    }>(),
    'Update Scheduled Scene Failure': props<{ error: string }>(),

    'Delete Scheduled Scene Success': props<{ id: string }>(),
    'Delete Scheduled Scene Failure': props<{ error: string }>(),
  },
});
