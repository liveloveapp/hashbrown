import { Light as LightModel } from '../models/light.model';
import { Light } from './components/Light';

interface LightsViewProps {
  lights: LightModel[];
}

export const LightsView = ({ lights }: LightsViewProps) => {
  return (
    <div className="flex flex-col gap-4">
      {lights.map((light) => (
        <Light key={light.id} light={light} />
      ))}
    </div>
  );
};
