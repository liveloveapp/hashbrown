import { Button } from '../shared/button';
import { useSmartHomeStore } from '../store/smart-home.store';
import { Light } from './components/Light';
import { LightDialogForm } from './components/LightDialogForm';

export const LightsView = () => {
  const lights = useSmartHomeStore((state) => state.lights);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between py-2">
        <p className="text-lg font-bold">Lights</p>
        <div className="flex justify-end">
          <LightDialogForm>
            <Button variant="outline">Add Light</Button>
          </LightDialogForm>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {lights.map((light) => (
          <Light key={light.id} light={light} />
        ))}
      </div>
    </div>
  );
};
