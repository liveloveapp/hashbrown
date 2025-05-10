import { s } from '@hashbrownai/core';
import { ChatStatus, useStructuredCompletion } from '@hashbrownai/react';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  SceneLight as SceneLightModel,
  Scene as SceneModel,
} from '../../models/scene.model';
import { Button } from '../../shared/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../shared/dialog';
import { Input } from '../../shared/input';
import { Label } from '../../shared/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../shared/select';
import { useSmartHomeStore } from '../../store/smart-home.store';
import { SceneLight } from './SceneLight';
import { SceneLightRecommendation } from './SceneLightRecommendation';

interface SceneDialogFormProps {
  scene?: SceneModel;
}

export const SceneDialogForm = (
  props: SceneDialogFormProps & {
    children: React.ReactNode;
  },
) => {
  const { scene, children } = props;

  const addScene = useSmartHomeStore((state) => state.addScene);
  const updateScene = useSmartHomeStore((state) => state.updateScene);
  const lights = useSmartHomeStore((state) => state.lights);

  const [sceneName, setSceneName] = useState(scene?.name || '');
  const [sceneLights, setSceneLights] = useState<SceneLightModel[]>(
    scene?.lights || [],
  );
  const [open, setOpen] = useState(false);

  const { output, status } = useStructuredCompletion({
    input: open ? sceneName : null,
    model: 'gpt-4o-mini',
    system: `Predict the lights that will be added to the scene based on the name. For example,
    if the scene name is "Dim Bedroom Lights", suggest adding any lights that might
    be in the bedroom at a lower brightness.

    Here's the list of lights:
    ${lights.map((light) => `${light.id}: ${light.name}`).join('\n')}`,
    schema: s.object('Your response', {
      lights: s.array(
        'The lights to add to the scene',
        s.object('A join between a light and a scene', {
          lightId: s.string('the ID of the light to add'),
          brightness: s.number('the brightness of the light'),
        }),
      ),
    }),
    examples: [
      {
        input: 'Dim Bedroom Lights',
        output: {
          lights: [
            { lightId: '1', brightness: 20 },
            { lightId: '2', brightness: 20 },
          ],
        },
      },
      {
        input: 'All Lights On',
        output: {
          lights: [
            { lightId: '3', brightness: 100 },
            { lightId: '4', brightness: 100 },
          ],
        },
      },
    ],
  });

  // Get available lights that aren't already in the scene
  const availableLights = lights.filter(
    (light) =>
      !sceneLights.some((sceneLight) => sceneLight.lightId === light.id),
  );

  const handleAddLight = (lightId: string) => {
    const light = lights.find((l) => l.id === lightId);
    if (light) {
      setSceneLights([...sceneLights, { lightId, brightness: 100 }]);
    }
  };

  const handleUpdateLightBrightness = (lightId: string, brightness: number) => {
    setSceneLights(
      sceneLights.map((light) =>
        light.lightId === lightId ? { ...light, brightness } : light,
      ),
    );
  };

  const handleRemoveLight = (lightId: string) => {
    setSceneLights(sceneLights.filter((light) => light.lightId !== lightId));
  };

  const handleSubmit = () => {
    if (scene) {
      updateScene(scene.id, {
        name: sceneName,
        lights: sceneLights,
      });
    } else {
      addScene({
        id: uuidv4(),
        name: sceneName,
        lights: sceneLights,
      });
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{scene ? 'Edit Scene' : 'Add Scene'}</DialogTitle>
          <DialogDescription>
            {scene
              ? 'Edit your scene settings.'
              : 'Create a new scene for your system.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="sceneName">Scene Name</Label>
            <Input
              id="sceneName"
              placeholder="Enter scene name"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Scene Lights</Label>
            {sceneLights.length > 0 ? (
              <div className="space-y-2">
                {sceneLights.map((sceneLight) => {
                  const light = lights.find((l) => l.id === sceneLight.lightId);
                  return (
                    <SceneLight
                      key={sceneLight.lightId}
                      name={light?.name || 'Unknown Light'}
                      sceneLight={sceneLight}
                      onEdit={handleUpdateLightBrightness}
                      onRemove={handleRemoveLight}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No lights added to this scene yet.
              </p>
            )}

            {availableLights.length > 0 && (
              <div className="grid gap-2">
                <Select onValueChange={handleAddLight}>
                  <SelectTrigger id="addLight" className="w-full">
                    <SelectValue placeholder="Select a light to add" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Available Lights</SelectLabel>
                      {availableLights.map((light) => (
                        <SelectItem key={light.id} value={light.id}>
                          {light.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label>Recommendations</Label>
              {status !== ChatStatus.Idle && (
                <p className="text-sm text-muted-foreground">
                  Generating recommendations...
                </p>
              )}
              {output?.lights.map((prediction) => (
                <SceneLightRecommendation
                  key={prediction.lightId}
                  lightId={prediction.lightId}
                  brightness={prediction.brightness}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-start">
          <Button type="submit" onClick={handleSubmit}>
            {scene ? 'Update' : 'Add'} Scene
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
