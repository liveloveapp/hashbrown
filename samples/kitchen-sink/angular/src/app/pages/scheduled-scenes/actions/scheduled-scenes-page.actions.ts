import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ScheduledScene } from '../../../models/scheduled-scene.model';

export const ScheduledScenesPageActions = createActionGroup({
  source: 'Scheduled Scenes Page',
  events: {
    'Open Scheduled Scene Dialog': props<{ scheduledScene?: ScheduledScene }>(),
    'Close Scheduled Scene Dialog': emptyProps(),
    Enter: emptyProps(),
    'Add Scheduled Scene': props<{
      scheduledScene: Omit<ScheduledScene, 'id'>;
    }>(),
    'Update Scheduled Scene': props<{
      id: string;
      scheduledScene: Partial<ScheduledScene>;
    }>(),
    'Delete Scheduled Scene': props<{ id: string }>(),
  },
});
