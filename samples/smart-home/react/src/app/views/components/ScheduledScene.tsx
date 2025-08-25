import { Pencil, Trash } from 'lucide-react';
import { ScheduledScene as ScheduledSceneModel } from '../../models/scheduled-scene.model';
import { Button } from '../../shared/button';
import { Switch } from '../../shared/switch';

export interface ScheduledSceneProps {
  scheduledScene: ScheduledSceneModel;
  onEdit?: () => void;
}

export const ScheduledScene = ({
  scheduledScene,
  onEdit,
}: ScheduledSceneProps) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatWeekdays = (weekdays?: string[]) => {
    if (!weekdays || weekdays.length === 0) return 'every day';
    if (weekdays.length === 7) return 'every day';
    if (weekdays === undefined) return 'every day';
    return weekdays.join(', ');
  };

  return (
    <div
      className="grid gap-2 items-center"
      style={{ gridTemplateColumns: 'auto 2fr 2fr 3fr auto auto' }}
    >
      <div className="flex items-center justify-center">
        <Switch checked={scheduledScene.isEnabled} />
      </div>
      <div className="flex items-center">
        <p className="truncate">Scene ID: {scheduledScene.sceneId}</p>
      </div>
      <div className="flex items-center">
        <p className="truncate">
          {scheduledScene.startDate.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
      <div className="flex items-center text-sm">
        <p className="truncate">
          {scheduledScene.recurrenceRule
            ? formatWeekdays(scheduledScene.recurrenceRule.weekdays)
            : 'every day'}
        </p>
      </div>
      <div className="flex items-center justify-center w-10">
        <Button size="icon" variant="secondary" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center justify-center w-10">
        <Button size="icon" variant="destructive">
          <Trash className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
