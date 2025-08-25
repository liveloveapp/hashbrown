import { Button } from '../shared/button';
import { useSmartHomeStore } from '../store/smart-home.store';
import { Scene } from './components/Scene';
import { SceneDialogForm } from './components/SceneDialogForm';

export const ScenesView = () => {
  const scenes = useSmartHomeStore((state) => state.scenes);

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
