import { Pencil, Play, Trash } from 'lucide-react';
import { Scene as SceneModel } from '../../models/scene.model';
import { Button } from '../../shared/button';
import { useSmartHomeStore } from '../../store/smart-home.store';
import { SceneDialogForm } from './SceneDialogForm';

export interface SceneProps {
  scene: SceneModel;
}

export const Scene = ({ scene }: SceneProps) => {
  const updateLight = useSmartHomeStore((state) => state.updateLight);
  const deleteScene = useSmartHomeStore((state) => state.deleteScene);

  const handleApplyScene = () => {
    // Apply each light's brightness from the scene to the corresponding light in the store
    scene.lights.forEach((sceneLight) => {
      updateLight(sceneLight.lightId, { brightness: sceneLight.brightness });
    });
  };

  const handleDeleteScene = () => {
    deleteScene(scene.id);
  };

  return (
    <div
      className="grid gap-2 items-center"
      style={{ gridTemplateColumns: '3fr 2fr auto auto auto' }}
    >
      <div className="flex items-center">
        <p className="truncate font-medium">{scene.name}</p>
      </div>
      <div className="flex items-center">
        <p className="truncate text-sm text-muted-foreground">
          {scene.lights.length} {scene.lights.length === 1 ? 'light' : 'lights'}
        </p>
      </div>
      <div className="flex items-center justify-center w-10">
        <Button size="icon" variant="default" onClick={handleApplyScene}>
          <Play className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center justify-center w-10">
        <SceneDialogForm scene={scene}>
          <Button size="icon" variant="secondary">
            <Pencil className="h-4 w-4" />
          </Button>
        </SceneDialogForm>
      </div>
      <div className="flex items-center justify-center w-10">
        <Button size="icon" variant="destructive" onClick={handleDeleteScene}>
          <Trash className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
