import { s } from '@hashbrownai/core';
import { useStructuredCompletion } from '@hashbrownai/react';
import { useMemo, useState } from 'react';
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
import { CircleAlert } from 'lucide-react';

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

  const input = useMemo(() => {
    if (!open) return null;
    if (!sceneName) return null;

    return {
      input: sceneName,
      availableLights: lights.map((light) => ({
        id: light.id,
        name: light.name,
      })),
    };
  }, [open, sceneName, lights]);

  const { output, isSending, exhaustedRetries } = useStructuredCompletion({
    debugName: 'SceneDialogForm',
    input,
    model: 'gpt-4.1-mini',
    system: `
      You are an assistant that helps the user configure a lighting scene.
      The user will choose a name for the scene, and you will predict the
      lights that should be added to the scene based on the name. The input
      will be the scene name and the list of lights that are available.

      # Rules
      - Only suggest lights from the provided "availableLights" input list.
      - Pick a brightness level for each light that is appropriate for the scene.
    `,
    schema: s.object('Your response', {
      lights: s.array(
        'The lights to add to the scene',
        s.object('A join between a light and a scene', {
          lightId: s.string('the ID of the light to add'),
          brightness: s.number('the brightness of the light'),
        }),
      ),
    }),
    retries: 3,
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
              {!exhaustedRetries && isSending && (
                <p className="text-sm text-muted-foreground">
                  Generating recommendations...
                </p>
              )}
              {output?.lights?.map((prediction) => (
                <SceneLightRecommendation
                  key={prediction.lightId}
                  lightId={prediction.lightId}
                  brightness={prediction.brightness}
                />
              ))}

              {exhaustedRetries && (
                <div className="mt-1 flex gap-2 bg-destructive/80 rounded-md p-2 text-primary-foreground">
                  <CircleAlert />
                  Recommendations are not available at this time.
                </div>
              )}
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
