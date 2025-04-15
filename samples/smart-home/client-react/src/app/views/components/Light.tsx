import { Pencil, Trash } from 'lucide-react';
import { Light as LightModel } from '../../models/light.model';
import { Button } from '../../shared/button';
import { Slider } from '../../shared/slider';

export interface LightProps {
  light: LightModel;
}

export const Light = ({ light }: LightProps) => {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="flex">
        <p>{light.name}</p>
      </div>
      <Slider
        defaultValue={[50]}
        max={100}
        step={1}
        value={[light.brightness]}
      />
      <div className="flex gap-2">
        <Button size="icon">
          <Pencil />
        </Button>
        <Button size="icon" variant="destructive">
          <Trash />
        </Button>
      </div>
    </div>
  );
};
