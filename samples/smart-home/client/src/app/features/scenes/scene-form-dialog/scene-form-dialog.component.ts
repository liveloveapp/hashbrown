import { CommonModule } from '@angular/common';
import { Component, computed, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { Store } from '@ngrx/store';
import { Scene } from '../../../models/scene.model';
import { selectAllLights, selectLightEntities } from '../../../store';

@Component({
  selector: 'app-scene-form-dialog',
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
    <h2 mat-dialog-title>{{ data ? 'Edit' : 'Add' }} Scene</h2>
    <mat-dialog-content>
      <form [formGroup]="form">
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
          @for (light of lightsFormArray.controls; track $index) {
            <div [formGroupName]="$index" class="light-config">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Light</mat-label>
                <mat-select formControlName="lightId">
                  @for (availableLight of lights(); track availableLight.id) {
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

        @let predictedLights = predictedLightsResource.value();
        @if (predictedLights) {
          <h5>
            <mat-icon aria-hidden="true" inline>bolt</mat-icon>
            Suggestions
          </h5>
          @for (light of predictedLights; track light.lightId) {
            @let suggestedLight = lightEntities()[light.lightId];

            <div class="predicted-light">
              <span>{{ suggestedLight?.name }}</span>
              <span>Brightness: {{ light.brightness }}%</span>
              <button
                matButton
                type="button"
                (click)="addPredictedLightToScene(light)"
              >
                Add
              </button>
            </div>
          }
        }

        <button mat-button type="button" (click)="addLight()">Add Light</button>
      </form>

      @if (lostService()) {
        <div class="error">
          <mat-icon inline>error</mat-icon>Structured completion is not
          available.
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="undefined">Cancel</button>
      <button
        mat-raised-button
        color="primary"
        [disabled]="!form.valid"
        [mat-dialog-close]="form.value"
      >
        {{ data ? 'Save' : 'Add' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      h5 {
        display: flex;
        align-items: center;
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 400px;
        padding: 16px 0;
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
        grid-auto-columns: auto 120px 50px;
      }

      mat-form-field {
        flex: 1;
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
export class SceneFormDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SceneFormDialogComponent>);
  protected data = inject<Scene | undefined>(MAT_DIALOG_DATA);
  protected store = inject(Store);
  lights = this.store.selectSignal(selectAllLights);
  lightEntities = this.store.selectSignal(selectLightEntities);
  protected form = this.fb.group({
    name: ['', Validators.required],
    lights: this.fb.array([]),
  });
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  sceneNameSignal = toSignal(this.form.get('name')!.valueChanges);

  /**
   * --------------------------------------------------------------------------
   * Predicted Lights Resource
   * --------------------------------------------------------------------------
   */
  predictedLightsResource = structuredCompletionResource({
    model: 'gpt-4.1',
    system: `
      Predict the lights that will be added to the scene based on the name. 
      For example, if the scene name is "Dim Bedroom Lights", suggest adding
      any lights that might be in the bedroom at a lower brightness.
    `,
    input: computed(() => {
      if (!this.sceneNameSignal()) return null;

      return {
        input: this.sceneNameSignal(),
        lights: untracked(() => this.lights()).map((light) => ({
          id: light.id,
          name: light.name,
        })),
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

  protected lostService = computed(
    () => this.predictedLightsResource.status() === 'error',
  );

  protected get lightsFormArray() {
    return this.form.get('lights') as FormArray;
  }

  constructor() {
    if (this.data) {
      this.form.patchValue({
        name: this.data.name,
      });

      this.data.lights.forEach((light) => {
        this.addLight(light);
      });
    } else {
      this.addLight();
    }
  }

  protected addLight(light?: { lightId: string; brightness: number }) {
    const lightGroup = this.fb.group({
      lightId: [light?.lightId || '', Validators.required],
      brightness: [
        light?.brightness || 50,
        [Validators.required, Validators.min(0), Validators.max(100)],
      ],
    });

    this.lightsFormArray.push(lightGroup);
  }

  protected removeLight(index: number) {
    this.lightsFormArray.removeAt(index);
  }

  protected addPredictedLightToScene(light: {
    lightId: string;
    brightness: number;
  }) {
    this.lightsFormArray.push(
      this.fb.group({
        lightId: [light.lightId, Validators.required],
        brightness: [light.brightness, Validators.required],
      }),
    );
  }
}
