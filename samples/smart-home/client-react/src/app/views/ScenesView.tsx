import { Scene as SceneModel } from '../models/scene.model';
import { Button } from '../shared/button';
import { Scene } from './components/Scene';
import { SceneDialogForm } from './components/SceneDialogForm';

interface ScenesViewProps {
  scenes: SceneModel[];
}

export const ScenesView = ({ scenes }: ScenesViewProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between py-2">
        <p className="text-lg font-bold">Scenes</p>
        <SceneDialogForm>
          <Button variant="outline">Add Scene</Button>
        </SceneDialogForm>
      </div>

      <div className="flex flex-col gap-4">
        {scenes.map((scene) => (
          <Scene key={scene.id} scene={scene} />
        ))}
      </div>
    </div>
  );
};
