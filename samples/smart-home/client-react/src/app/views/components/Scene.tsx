import { Pencil, Play, Trash } from 'lucide-react';
import { Scene as SceneModel } from '../../models/scene.model';
import { Button } from '../../shared/button';

export interface SceneProps {
  scene: SceneModel;
  onEdit?: () => void;
}

export const Scene = ({ scene, onEdit }: SceneProps) => {
  return (
    <div
      className="grid gap-2 items-center"
      style={{ gridTemplateColumns: '3fr 2fr auto auto auto' }}
    >
      <div className="flex items-center">
        <p className="truncate font-medium">{scene.name}</p>
      </div>
      <div className="flex items-center">
        <p className="truncate text-sm text-muted-foreground">
          {scene.lights.length} {scene.lights.length === 1 ? 'light' : 'lights'}
        </p>
      </div>
      <div className="flex items-center justify-center w-10">
        <Button size="icon" variant="default">
          <Play className="h-4 w-4" />
        </Button>
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
