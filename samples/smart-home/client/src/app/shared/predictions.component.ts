import {
  Component,
  computed,
  inject,
  linkedSignal,
  untracked,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { s } from '@hashbrownai/core';
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
import { structuredCompletionResource } from '@hashbrownai/angular';

const PREDICTIONS_SCHEMA = s.anyOf([
  s.object('Suggest adding a scene to the system', {
    type: s.literal('Add Scene'),
    name: s.string('The suggested name of the scene'),
    lights: s.array(
      'The lights in the scene',
      s.object('A light in the scene', {
        lightId: s.string('The ID of the light'),
        brightness: s.integer('A number between 0-100'),
      }),
    ),
  }),
  s.object('Suggest adding a light to a scene', {
    type: s.literal('Add Light to Scene'),
    lightId: s.string('The ID of the light'),
    sceneId: s.string('The ID of the scene'),
    brightness: s.integer('A number between 0-100'),
  }),
]);

@Component({
  selector: 'app-predictions',
  template: `
    @if (lostService()) {
      <div class="error">
        <mat-icon inline>error</mat-icon>Prediction is not available.
      </div>
    }
    <!-- Loop over predictions and display according to type -->
    @for (prediction of output(); track $index) {
      @switch (prediction.type) {
        @case ('Add Scene') {
          <div class="prediction">
            <div class="predictionIcon">
              <mat-icon inline>bolt</mat-icon>
            </div>
            <p>
              Add Scene called "<span class="predictionValue">{{
                prediction.name
              }}</span
              >" with
              <span class="predictionValue">{{
                prediction.lights.length
              }}</span>
              lights
            </p>
            <div class="predictionActions">
              <button
                class="rejectPrediction"
                (click)="removePrediction($index)"
              >
                Dismiss
              </button>
              <button
                class="acceptPrediction"
                (click)="
                  addScene($index, {
                    name: prediction.name,
                    lights: prediction.lights,
                  })
                "
              >
                Accept
              </button>
            </div>
          </div>
        }
        @case ('Add Light to Scene') {
          @let light = lightEntities()[prediction.lightId];
          @let scene = sceneEntities()[prediction.sceneId];

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
              <button
                class="rejectPrediction"
                (click)="removePrediction($index)"
              >
                Dismiss
              </button>
              <button
                class="acceptPrediction"
                (click)="
                  addLightToScene($index, {
                    lightId: prediction.lightId,
                    sceneId: prediction.sceneId,
                    brightness: prediction.brightness,
                  })
                "
              >
                Accept
              </button>
            </div>
          </div>
        }
      }
    }
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
        background-color: rgba(255, 255, 255, 0.88);
        backdrop-filter: blur(8px);
        padding: 16px;
        border: 1px solid rgba(0, 0, 0, 0.12);
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
        line-height: 1.5;
        color: rgba(0, 0, 0, 0.87);
      }

      .predictionValue {
        color: rgba(0, 0, 0, 1);
        font-weight: 500;
      }

      .predictionActions {
        grid-area: actions;
        display: flex;
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
        background-color: rgba(255, 255, 255, 255.12);
        border: 1px solid rgba(255, 255, 255, 255.12);
      }

      .prediction button.acceptPrediction {
        background-color: var(--mat-sys-primary);
        border: 1px solid var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
      }

      .error {
        background-color: var(--mat-sys-error-container);
        width: fit-content;
        padding: 16px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        gap: 4px;
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

  /**
   * --------------------------------------------------------------------------
   * Predictions Resource
   * --------------------------------------------------------------------------
   */
  predictions = structuredCompletionResource({
    model: 'gpt-4.1',
    input: computed(() => {
      if (!this.lastAction()) return null;

      return {
        lastAction: this.lastAction(),
        context: untracked(() => ({
          lights: this.smartHomeService.lights(),
          scenes: this.smartHomeService.scenes(),
        })),
      };
    }),
    system: `
      You are an AI smart home assistant tasked with predicting the next possible user action in a 
      smart home configuration app. Your suggestions will be displayed as floating cards in the 
      bottom right of the screen.

      # Guidelines
      - The user already owns all necessary hardware. Do not suggest purchasing hardware.
      - Each prediction must be fully detailed with all required fields based on its type.

      # Rules
      - Always check the current lights and scenes states to avoid suggesting duplicates.
      - If a new light has just been added, consider adding it to an existing scene.
      - When recommending scene modifications, ensure that the scene does not already contain the 
        light in question.
      - You do not always need to make a prediction. Returning an empty array is also a valid 
        response.
      - You may make multiple predictions. Just add multiple predictions to the array.
    `,
    schema: s.streaming.array('Your predictions', PREDICTIONS_SCHEMA),
  });

  output = linkedSignal({
    source: this.predictions.value,
    computation: (source): s.Infer<typeof PREDICTIONS_SCHEMA>[] => {
      if (source === undefined || source === null) return [];

      return source;
    },
  });

  /**
   * --------------------------------------------------------------------------
   * End Predictions Resource
   * --------------------------------------------------------------------------
   */

  protected lostService = computed(() => this.predictions.status() === 'error');

  addScene(
    predictionIndex: number,
    scene: {
      name: string;
      lights: { lightId: string; brightness: number }[];
    },
  ) {
    this.removePrediction(predictionIndex);
    this.store.dispatch(PredictionsAiActions.addScene({ scene }));
  }

  addLightToScene(
    predictionIndex: number,
    sceneLight: {
      lightId: string;
      sceneId: string;
      brightness: number;
    },
  ) {
    this.removePrediction(predictionIndex);
    this.store.dispatch(PredictionsAiActions.addLightToScene(sceneLight));
  }

  removePrediction(index: number) {
    this.output.update((predictions) => {
      predictions.splice(index, 1);
      return predictions;
    });
  }
}
