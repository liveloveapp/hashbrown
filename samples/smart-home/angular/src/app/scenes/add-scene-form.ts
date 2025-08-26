import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  inject,
  linkedSignal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { SmartHome } from '../smart-home';
import { Scene } from '../types';

@Component({
  selector: 'app-add-scene-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDialogModule,
    MatSelectModule,
    MatSliderModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Add Scene</h2>
    <form [formGroup]="form" (ngSubmit)="saveScene()">
      <mat-dialog-content>
        <mat-form-field appearance="fill">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" />
          @if (
            form.get('name')?.errors?.['required'] && form.get('name')?.touched
          ) {
            <mat-error>Name is required</mat-error>
          }
        </mat-form-field>

        <div formArrayName="lights">
          @for (light of lightsArrayControl.controls; track $index) {
            <div [formGroupName]="$index" class="light-config">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Light</mat-label>
                <mat-select formControlName="lightId">
                  @for (
                    availableLight of smartHome.lights();
                    track availableLight.id
                  ) {
                    <mat-option [value]="availableLight.id">
                      {{ availableLight.name }}
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-slider [min]="0" [max]="100" [step]="1">
                <input matSliderThumb formControlName="brightness" />
              </mat-slider>

              <button
                mat-icon-button
                color="warn"
                type="button"
                (click)="removeLight($index)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }
        </div>

        @if (predictedLights().length) {
          <h5>
            <mat-icon aria-hidden="true" inline>bolt</mat-icon>
            Suggestions
          </h5>
          @for (light of predictedLights(); track light.lightId) {
            @let suggestedLight = smartHome.light(light.lightId)();

            <div class="predicted-light">
              <span>{{ suggestedLight.name }}</span>
              <span>{{ light.brightness }}%</span>
              <button
                mat-button
                type="button"
                (click)="addPredictedLightToScene($index, light)"
              >
                Add
              </button>
            </div>
          }
        }

        <button mat-button type="button" (click)="addLight()">Add Light</button>

        @if (lostService()) {
          <div class="error">
            <mat-icon inline>error</mat-icon>Structured completion is not
            available.
          </div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton (click)="closeDialog()">Cancel</button>
        <button
          matButton="elevated"
          color="primary"
          [disabled]="!form.valid"
          type="submit"
        >
          Add
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      h5 {
        display: flex;
        align-items: center;
      }

      :host,
      form,
      mat-dialog-content {
        width: 400px;
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px 0;
      }

      mat-form-field {
        width: 100%;
      }

      .light-config {
        display: flex;
        gap: 16px;
        align-items: center;
      }

      .light-config:not(:last-child) {
        margin-bottom: 8px;
      }

      .predicted-light {
        display: grid;
        gap: 8px;
        grid-template-areas: 'a a a';
        grid-auto-columns: auto 24px 50px;
        align-items: center;
      }

      mat-form-field {
        flex: 1;
      }

      h5 {
        margin-top: 8px;
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
})
export class AddSceneForm {
  readonly dialogRef = inject(MatDialogRef<AddSceneForm>);
  readonly smartHome = inject(SmartHome);
  readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly lightsArrayControl = new FormArray<
    FormGroup<{
      lightId: FormControl<string>;
      brightness: FormControl<number>;
    }>
  >([]);
  readonly form = new FormGroup({
    name: this.nameControl,
    lights: this.lightsArrayControl,
  });
  readonly sceneNameSignal = toSignal(this.nameControl.valueChanges);

  /**
   * --------------------------------------------------------------------------
   * Predicted Lights Resource
   * --------------------------------------------------------------------------
   */
  predictedLightsResource = structuredCompletionResource({
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
      if (!this.sceneNameSignal()) return null;

      return {
        input: this.sceneNameSignal(),
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

  predictedLights = linkedSignal({
    source: this.predictedLightsResource.value,
    computation: (source) => {
      if (source === undefined || source === null) return [];

      return source;
    },
  });

  protected lostService = computed(
    () => this.predictedLightsResource.status() === 'error',
  );

  protected addLight(light?: { lightId: string; brightness: number }) {
    const lightGroup = new FormGroup({
      lightId: new FormControl(light?.lightId ?? '', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      brightness: new FormControl(light?.brightness ?? 50, {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.min(0),
          Validators.max(100),
        ],
      }),
    });

    this.lightsArrayControl.push(lightGroup);
  }

  protected removeLight(index: number) {
    this.lightsArrayControl.removeAt(index);
  }

  protected addPredictedLightToScene(
    index: number,
    light: {
      lightId: string;
      brightness: number;
    },
  ) {
    this.predictedLights.update((lights) =>
      lights.filter((_, i) => i !== index),
    );

    this.lightsArrayControl.push(
      new FormGroup(
        {
          lightId: new FormControl(light.lightId, {
            nonNullable: true,
            validators: [Validators.required],
          }),
          brightness: new FormControl(light.brightness, {
            nonNullable: true,
            validators: [
              Validators.required,
              Validators.min(0),
              Validators.max(100),
            ],
          }),
        },
        {},
      ),
    );
  }

  protected closeDialog() {
    this.dialogRef.close();
  }

  protected saveScene() {
    if (!this.form.valid) return;

    const scene = this.form.value;

    this.smartHome.addScene(scene as unknown as Omit<Scene, 'id'>);
    this.closeDialog();
  }
}
