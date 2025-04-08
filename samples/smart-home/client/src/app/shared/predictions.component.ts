import { Component, inject, linkedSignal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { predictionResource, s } from '@hashbrownai/angular';
import { Store } from '@ngrx/store';
import { PredictionsAiActions } from '../features/predictions/actions';
import { SmartHomeService } from '../services/smart-home.service';
import {
  selectAllLights,
  selectAllScenes,
  selectLastUserAction,
  selectLightEntities,
  selectScenesEntities,
} from '../store';

const PREDICTIONS_SCHEMA = s.anyOf('You can predict any of these actions', [
  s.object('Suggests adding a light to the system', {
    type: s.constString('MUST BE "Add Light"', 'Add Light'),
    reasonForSuggestion: s.string('Why do you think this should come next?'),
    name: s.string('The suggested name of the light'),
    brightness: s.integer('A number between 0-100'),
  }),
  s.object('Suggest adding a scene to the system', {
    type: s.constString('MUST BE "Add Scene"', 'Add Scene'),
    reasonForSuggestion: s.string('Why do you think this should come next?'),
    name: s.string('The suggested name of the scene'),
    lights: s.array(
      'The lights in the scene',
      s.object('A light in the scene', {
        lightId: s.string('The ID of the light'),
        brightness: s.integer('A number between 0-100'),
      })
    ),
  }),
  s.object('Suggest scheduling a scene to the system', {
    type: s.constString('MUST BE "Schedule Scene"', 'Schedule Scene'),
    reasonForSuggestion: s.string('Why do you think this should come next?'),
    sceneId: s.string('The ID of the scene'),
    datetime: s.string('The datetime of the scene'),
  }),
  s.object('Suggest adding a light to a scene', {
    type: s.constString('MUST BE "Add Light to Scene"', 'Add Light to Scene'),
    reasonForSuggestion: s.string('Why do you think this should come next?'),
    lightId: s.string('The ID of the light'),
    sceneId: s.string('The ID of the scene'),
    brightness: s.integer('A number between 0-100'),
  }),
  s.object('Suggest removing a light from a scene', {
    type: s.constString(
      'MUST BE "Remove Light from Scene"',
      'Remove Light from Scene'
    ),
    reasonForSuggestion: s.string('Why do you think this should come next?'),
    lightId: s.string('The ID of the light'),
    sceneId: s.string('The ID of the scene'),
  }),
]);

@Component({
  selector: 'app-predictions',
  standalone: true,
  template: `
    <!-- Loop over predictions and display according to type -->
    @for (prediction of output(); track $index) { @switch (prediction.type) {
    @case ('Add Light') {
    <div class="prediction">
      <div class="predictionIcon">
        <mat-icon inline>bolt</mat-icon>
      </div>
      <p>
        Add Light called "<span class="predictionValue">{{
          prediction.name
        }}</span
        >" with brightness
        <span class="predictionValue">{{ prediction.brightness }}</span>
      </p>
      <div class="predictionActions">
        <button class="rejectPrediction" (click)="removePrediction($index)">
          Dismiss
        </button>
        <button
          class="acceptPrediction"
          (click)="
            addLight($index, {
              name: prediction.name,
              brightness: prediction.brightness
            })
          "
        >
          Accept
        </button>
      </div>
    </div>
    } @case ('Add Scene') {
    <div class="prediction">
      <div class="predictionIcon">
        <mat-icon inline>bolt</mat-icon>
      </div>
      <p>
        Add Scene called "<span class="predictionValue">{{
          prediction.name
        }}</span
        >" with
        <span class="predictionValue">{{ prediction.lights.length }}</span>
        lights
      </p>
      <div class="predictionActions">
        <button class="rejectPrediction" (click)="removePrediction($index)">
          Dismiss
        </button>
        <button
          class="acceptPrediction"
          (click)="
            addScene($index, {
              name: prediction.name,
              lights: prediction.lights
            })
          "
        >
          Accept
        </button>
      </div>
    </div>
    } @case ('Schedule Scene') {
    <div class="prediction">
      <div class="predictionIcon">
        <mat-icon inline>bolt</mat-icon>
      </div>
      <p>
        Schedule Scene "<span class="predictionValue">{{
          prediction.sceneId
        }}</span
        >" at
        <span class="predictionValue">{{ prediction.datetime }}</span>
      </p>
      <div class="predictionActions">
        <button class="rejectPrediction" (click)="removePrediction($index)">
          Dismiss
        </button>
        <button
          class="acceptPrediction"
          (click)="
            scheduleScene($index, {
              sceneId: prediction.sceneId,
              datetime: prediction.datetime
            })
          "
        >
          Accept
        </button>
      </div>
    </div>
    } @case ('Add Light to Scene') { @let light =
    lightEntities()[prediction.lightId]; @let scene =
    sceneEntities()[prediction.sceneId];

    <div class="prediction">
      <div class="predictionIcon">
        <mat-icon inline>bolt</mat-icon>
      </div>
      <p>
        Add Light "<span class="predictionValue">{{ light?.name }}</span
        >" to Scene "<span class="predictionValue">{{ scene?.name }}</span
        >" with brightness
        <span class="predictionValue">{{ prediction.brightness }}</span>
      </p>
      <div class="predictionActions">
        <button class="rejectPrediction" (click)="removePrediction($index)">
          Dismiss
        </button>
        <button
          class="acceptPrediction"
          (click)="
            addLightToScene($index, {
              lightId: prediction.lightId,
              sceneId: prediction.sceneId,
              brightness: prediction.brightness
            })
          "
        >
          Accept
        </button>
      </div>
    </div>
    } @case ('Remove Light from Scene') { @let light =
    lightEntities()[prediction.lightId]; @let scene =
    sceneEntities()[prediction.sceneId];

    <div class="prediction">
      <div class="predictionIcon">
        <mat-icon inline>remove_circle</mat-icon>
      </div>
      <p>
        Remove Light "<span class="predictionValue">{{ light?.name }}</span
        >" from Scene "<span class="predictionValue">{{ scene?.name }}</span
        >"
      </p>
      <div class="predictionActions">
        <button class="rejectPrediction" (click)="removePrediction($index)">
          Dismiss
        </button>
        <button
          class="acceptPrediction"
          (click)="
            removeLightFromScene($index, {
              lightId: prediction.lightId,
              sceneId: prediction.sceneId
            })
          "
        >
          Accept
        </button>
      </div>
    </div>
    } } }
  `,
  styles: [
    `
      :host {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 1000;
        display: flex;
        flex-direction: column-reverse;
        width: 300px;
        gap: 8px;
      }

      .prediction {
        background-color: rgba(0, 0, 0, 0.54);
        padding: 16px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        display: grid;
        width: 100%;
        grid-template-areas:
          'icon content'
          'actions actions';
        grid-template-columns: 24px 1fr;
        grid-template-rows: 1fr 32px;
        gap: 8px;
      }

      .predictionIcon {
        grid-area: icon;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        line-height: 24px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .prediction p {
        grid-area: content;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.87);
      }

      .predictionValue {
        color: rgba(255, 255, 255, 1);
        font-weight: 500;
      }

      .predictionActions {
        grid-area: actions;
        display: flex;
        align-items: row-reverse;
        align-self: end;
        justify-self: end;
        gap: 8px;
      }

      .prediction button {
        background-color: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.12);
        padding: 4px;
        font-size: 10px;
        text-transform: uppercase;
      }

      .rejectPrediction {
        background-color: rgba(255, 0, 0, 0.12);
        border: 1px solid rgba(255, 0, 0, 0.12);
      }

      .prediction button.acceptPrediction {
        background-color: var(--mat-sys-primary);
        border: 1px solid var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
      }
    `,
  ],
  imports: [MatIconModule],
})
export class PredictionsComponent {
  smartHomeService = inject(SmartHomeService);
  store = inject(Store);
  lastAction = this.store.selectSignal(selectLastUserAction);
  lights = this.store.selectSignal(selectAllLights);
  scenes = this.store.selectSignal(selectAllScenes);
  lightEntities = this.store.selectSignal(selectLightEntities);
  sceneEntities = this.store.selectSignal(selectScenesEntities);

  // Revised prompt with detailed examples
  predictions = predictionResource({
    model: 'gpt-4o',
    input: this.lastAction,
    description: `
You are an AI smart home assistant tasked with predicting the next possible user action in a smart home configuration app. Your suggestions will be displayed as floating cards in the bottom right of the screen.

Important Guidelines:
- The user already owns all necessary hardware. Do not suggest purchasing hardware.
- Every prediction must include a concise 'reasonForSuggestion' that explains the suggestion in one sentence.
- Each prediction must be fully detailed with all required fields based on its type.

Prediction Types:

1. Add Light
   - Required fields: name (string), brightness (number)
   - Example:
     {
       "type": "Add Light",
       "reasonForSuggestion": "Enhance room ambience with additional lighting",
       "name": "Living Room Lamp",
       "brightness": 75
     }

2. Add Scene
   - Required fields: name (string), lights (array of objects with lightId (string) and brightness (number))
   - Example:
     {
       "type": "Add Scene",
       "reasonForSuggestion": "Create a cozy evening scene",
       "name": "Evening Relaxation",
       "lights": [
         { "lightId": "light-101", "brightness": 60 },
         { "lightId": "light-102", "brightness": 40 }
       ]
     }

3. Schedule Scene
   - Required fields: sceneId (string), datetime (string in ISO format)
   - Example:
     {
       "type": "Schedule Scene",
       "reasonForSuggestion": "Prepare a morning wake-up routine",
       "sceneId": "scene-201",
       "datetime": "2025-04-03T07:00:00Z"
     }

4. Add Light to Scene
   - Required fields: lightId (string), sceneId (string), brightness (number)
   - Example:
     {
       "type": "Add Light to Scene",
       "reasonForSuggestion": "Integrate the new light into your dinner scene",
       "lightId": "light-303",
       "sceneId": "scene-404",
       "brightness": 80
     }

5. Remove Light from Scene
   - Required fields: lightId (string), sceneId (string)
   - Example:
     {
       "type": "Remove Light from Scene",
       "reasonForSuggestion": "Remove redundant lighting from your scene",
       "lightId": "light-505",
       "sceneId": "scene-606"
     }

Additional Rules:
- Always check the current lights and scenes states to avoid suggesting duplicates.
- If a new light has just been added, consider suggesting complementary lights or adding it to an existing scene.
- When recommending scene modifications, ensure that the scene does not already contain the light in question.
- You do not always need to make a prediction. Returning an empty array is also a valid response.
- You may make multiple predictions. Just add multiple predictions to the array.
    `,
    signals: {
      lights: {
        signal: this.lights,
        description: 'All lights in the smart home',
      },
      scenes: {
        signal: this.scenes,
        description: 'All scenes in the smart home',
      },
    },
    outputSchema: s.array('The predictions', PREDICTIONS_SCHEMA),
  });

  output = linkedSignal({
    source: this.predictions.value,
    computation: (source): s.Infer<typeof PREDICTIONS_SCHEMA>[] => {
      if (source === undefined || source.length === 0) return [];

      return source;
    },
  });

  // Dispatch actions for different predictions
  addLight(
    predictionIndex: number,
    light: { name: string; brightness: number }
  ) {
    this.removePrediction(predictionIndex);
    this.store.dispatch(PredictionsAiActions.addLight({ light }));
  }

  addScene(
    predictionIndex: number,
    scene: {
      name: string;
      lights: { lightId: string; brightness: number }[];
    }
  ) {
    this.removePrediction(predictionIndex);
    this.store.dispatch(PredictionsAiActions.addScene({ scene }));
  }

  scheduleScene(
    predictionIndex: number,
    scene: { sceneId: string; datetime: string }
  ) {
    this.store.dispatch(
      PredictionsAiActions.scheduleScene({
        sceneId: scene.sceneId,
        datetime: scene.datetime,
      })
    );
  }

  addLightToScene(
    predictionIndex: number,
    sceneLight: {
      lightId: string;
      sceneId: string;
      brightness: number;
    }
  ) {
    this.removePrediction(predictionIndex);
    this.store.dispatch(PredictionsAiActions.addLightToScene(sceneLight));
  }

  removeLightFromScene(
    predictionIndex: number,
    sceneLight: { lightId: string; sceneId: string }
  ) {
    this.removePrediction(predictionIndex);
    this.store.dispatch(PredictionsAiActions.removeLightFromScene(sceneLight));
  }

  applyScene(predictionIndex: number, sceneId: string) {
    this.removePrediction(predictionIndex);
    this.store.dispatch(PredictionsAiActions.applyScene({ sceneId }));
  }

  removePrediction(index: number) {
    this.output.update((predictions) => {
      predictions.splice(index, 1);
      return predictions;
    });
  }
}
