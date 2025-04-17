import { Pencil, Trash } from 'lucide-react';
import { Light as LightModel } from '../../models/light.model';
import { Button } from '../../shared/button';
import { Slider } from '../../shared/slider';
import { useSmartHomeStore } from '../../store/smart-home.store';
import { LightDialogForm } from './LightDialogForm';

export interface LightProps {
  light: LightModel;
}

export const Light = ({ light }: LightProps) => {
  const updateLight = useSmartHomeStore((state) => state.updateLight);
  const deleteLight = useSmartHomeStore((state) => state.deleteLight);

  const handleBrightnessChange = (value: number[]) => {
    updateLight(light.id, { brightness: value[0] });
  };

  const handleDelete = () => {
    deleteLight(light.id);
  };

  return (
    <div
      className="grid gap-2 items-center"
      style={{ gridTemplateColumns: '2fr 4fr 60px auto auto' }}
    >
      <div className="flex items-center">
        <p className="truncate font-medium">{light.name}</p>
      </div>
      <div className="flex items-center w-full px-2">
        <Slider
          className="w-full"
          max={100}
          step={1}
          value={[light.brightness]}
          onValueChange={handleBrightnessChange}
        />
      </div>
      <div className="flex items-center justify-end">
        <p className="text-sm text-muted-foreground w-12 text-right">
          {light.brightness}%
        </p>
      </div>
      <div className="flex items-center justify-center w-10">
        <LightDialogForm light={light}>
          <Button size="icon" variant="secondary">
            <Pencil className="h-4 w-4" />
          </Button>
        </LightDialogForm>
      </div>
      <div className="flex items-center justify-center w-10">
        <Button size="icon" variant="destructive" onClick={handleDelete}>
          <Trash className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
