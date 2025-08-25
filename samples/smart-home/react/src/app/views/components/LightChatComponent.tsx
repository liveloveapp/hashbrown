import { Slider } from '../../shared/slider';
import { useSmartHomeStore } from '../../store/smart-home.store';

export interface LightProps {
  lightId: string;
}

export const LightChatComponent = ({ lightId }: LightProps) => {
  const light = useSmartHomeStore((state) =>
    state.lights.find((l) => l.id === lightId),
  );

  const updateLight = useSmartHomeStore((state) => state.updateLight);

  const handleBrightnessChange = (value: number[]) => {
    updateLight(lightId, { brightness: value[0] });
  };

  if (!light) {
    return <div>Light not found</div>;
  }

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
    </div>
  );
};
