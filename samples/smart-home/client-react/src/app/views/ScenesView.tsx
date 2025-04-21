import { ChatProvider, s } from '@hashbrownai/react';
import { Scene as SceneModel } from '../models/scene.model';
import { Button } from '../shared/button';
import { Scene } from './components/Scene';
import { SceneDialogForm } from './components/SceneDialogForm';

interface ScenesViewProps {
  scenes: SceneModel[];
}

export const ScenesView = ({ scenes }: ScenesViewProps) => {
  return (
    <ChatProvider
      endpoint={{
        url: 'http://localhost:3000/chat',
      }}
      model="gpt-4o-mini"
      temperature={0.5}
      // @todo U.G. Wilson - get the responseFormat lowered to be configurable
      // by the usePrediction hook without causing an infinite loop
      responseFormat={s.object('Your response', {
        lights: s.array(
          'The lights to add to the scene',
          s.object('A join between a light and a scene', {
            lightId: s.string('the ID of the light to add'),
            brightness: s.number('the brightness of the light'),
          }),
        ),
      })}
      tools={[]}
      maxTokens={1000}
    >
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
    </ChatProvider>
  );
};
