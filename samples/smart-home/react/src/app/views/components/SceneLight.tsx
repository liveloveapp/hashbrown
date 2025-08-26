import { Trash } from 'lucide-react';
import { SceneLight as SceneLightModel } from '../../models/scene.model';
import { Button } from '../../shared/button';
import { Slider } from '../../shared/slider';

export interface SceneLightProps {
  name: string;
  sceneLight: SceneLightModel;
  onEdit?: (lightId: string, brightness: number) => void;
  onRemove?: (lightId: string) => void;
}

export const SceneLight = ({
  name,
  sceneLight,
  onEdit,
  onRemove,
}: SceneLightProps) => {
  const handleBrightnessChange = (value: number[]) => {
    if (onEdit) {
      onEdit(sceneLight.lightId, value[0]);
    }
  };

  return (
    <div
      className="grid gap-2 items-center"
      style={{ gridTemplateColumns: '2fr 4fr 60px auto' }}
    >
      <div className="flex items-center">
        <p className="truncate font-medium">{name}</p>
      </div>
      <div className="flex items-center w-full px-2">
        <Slider
          className="w-full"
          max={100}
          step={1}
          value={[sceneLight.brightness]}
          onValueChange={handleBrightnessChange}
        />
      </div>
      <div className="flex items-center justify-end">
        <p className="text-sm text-muted-foreground w-12 text-right">
          {sceneLight.brightness}%
        </p>
      </div>
      {onRemove && (
        <div className="flex items-center justify-center w-10">
          <Button
            size="icon"
            variant="destructive"
            onClick={() => onRemove(sceneLight.lightId)}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
