import {
  computed,
  inject,
  Injectable,
  linkedSignal,
  Signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { s } from '@hashbrownai/core';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { SmartHome } from '../smart-home';

@Injectable({ providedIn: 'root' })
export class LightPredictor {
  private readonly smartHome = inject(SmartHome);

  predictLights(sceneName: Signal<string | undefined>): {
    predictedLights: WritableSignal<{ lightId: string; brightness: number }[]>;
    error: Signal<Error | undefined>;
    isLoading: Signal<boolean>;
  } {
    const predictionResource = structuredCompletionResource({
      model: 'gpt-4.1-mini',
      debugName: 'predictedLightsResource',
      system: `
        You are an assistant that helps the user configure a lighting scene.
        The user will choose a name for the scene, and you will predict the
        lights that should be added to the scene based on the name. The input
        will be the scene name and the list of lights that are available.
  
        # Rules
        - Only suggest lights from the provided "availableLights" input list.
        - Pick a brightness level for each light that is appropriate for the scene.
      `,
      input: computed(() => {
        if (!sceneName()) return null;

        return {
          input: sceneName(),
          availableLights: untracked(() => this.smartHome.lights()).map(
            (light) => ({
              id: light.id,
              name: light.name,
            }),
          ),
        };
      }),
      schema: s.streaming.array(
        'The lights to add to the scene',
        s.object('A join between a light and a scene', {
          lightId: s.string('the ID of the light to add'),
          brightness: s.number('the brightness of the light from 0 to 100'),
        }),
      ),
    });

    const predictedLights = linkedSignal({
      source: predictionResource.value,
      computation: (source) => {
        if (source === undefined || source === null) return [];

        return source;
      },
    });

    return {
      predictedLights,
      error: predictionResource.error,
      isLoading: predictionResource.isLoading,
    };
  }
}
