import { Light as LightModel } from '../models/light.model';
import { AddLightDialogForm } from './components/AddLightDialogForm';
import { Light } from './components/Light';

interface LightsViewProps {
  lights: LightModel[];
}

export const LightsView = ({ lights }: LightsViewProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between py-2">
        <p className="text-lg font-bold">Lights</p>
        <div className="flex justify-end">
          <AddLightDialogForm />
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
