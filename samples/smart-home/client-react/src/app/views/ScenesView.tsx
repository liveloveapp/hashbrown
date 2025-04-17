import { useState } from 'react';
import { Scene as SceneModel } from '../models/scene.model';
import { Button } from '../shared/button';
import { Scene } from './components/Scene';
import { SceneDialogForm } from './components/SceneDialogForm';

interface ScenesViewProps {
  scenes: SceneModel[];
}

export const ScenesView = ({ scenes }: ScenesViewProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<SceneModel | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement scene creation/editing
    setIsDialogOpen(false);
    setEditingScene(null);
  };

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
          <Scene
            key={scene.id}
            scene={scene}
            onEdit={() => {
              setEditingScene(scene);
              setIsDialogOpen(true);
            }}
          />
        ))}
      </div>
    </div>
  );
};
