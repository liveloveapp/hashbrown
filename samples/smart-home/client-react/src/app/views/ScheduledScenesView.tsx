import {
  ScheduledScene as ScheduledSceneModel,
  Weekday,
} from '../models/scheduled-scene.model';
import { type ComboboxOption } from '../shared/combobox';
import { ScheduledScene } from './components/ScheduledScene';

interface ScheduledScenesViewProps {
  scheduledScenes: ScheduledSceneModel[];
  scenes?: ComboboxOption[];
}

const WEEKDAYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const ScheduledScenesView = ({
  scheduledScenes,
  scenes = [],
}: ScheduledScenesViewProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between py-2">
        <p className="text-lg font-bold">Scheduled Scenes</p>
      </div>

      <div className="flex flex-col gap-4">
        {scheduledScenes.map((scheduledScene) => (
          <ScheduledScene
            key={scheduledScene.id}
            scheduledScene={scheduledScene}
            onEdit={() => {}}
          />
        ))}
      </div>
    </div>
  );
};
