import { Light as LightModel } from '../models/light.model';
import { Button } from '../shared/button';
import { Light } from './components/Light';
import { LightDialogForm } from './components/LightDialogForm';

interface LightsViewProps {
  lights: LightModel[];
}

export const LightsView = ({ lights }: LightsViewProps) => {
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
