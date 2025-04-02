import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatIconModule } from '@angular/material/icon';
import { Scene } from '../../../models/scene.model';
import { predictionResource } from '@cassini/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { z } from 'zod';
import { Store } from '@ngrx/store';
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
          @if (form.get('name')?.errors?.['required'] &&
          form.get('name')?.touched) {
          <mat-error>Name is required</mat-error>
          }
        </mat-form-field>

        <div formArrayName="lights">
          @for (light of lightsFormArray.controls; track $index) {
          <div [formGroupName]="$index" class="light-config">
            <mat-form-field>
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
              <mat-icon>remove_circle</mat-icon>
            </button>
          </div>
          }
        </div>

        @let suggestedLights = predictedLights.output(); @if (suggestedLights) {

        <h5><mat-icon aria-hidden="true" inline>bolt</mat-icon> Suggestions</h5>
        @for (light of suggestedLights; track light.lightId) { @let
        suggestedLight = lightEntities()[light.lightId];

        <div class="predicted-light">
          <span
            >{{ suggestedLight?.name }} - Brightness:
            {{ light.brightness }}%</span
          >
          <button
            mat-mini-button
            type="button"
            (click)="addPredictedLightToScene(light)"
          >
            Add
          </button>
        </div>
        } }

        <button mat-button type="button" (click)="addLight()">Add Light</button>
      </form>
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
      mat-form-field {
        flex: 1;
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
  predictedLights = predictionResource({
    input: this.sceneNameSignal,
    description: computed(
      () => `
      Predict the lights that will be added to the scene based on the name. For example,
      if the scene name is "Dim Bedroom Lights", suggest adding any lights that might
      be in the bedroom at a lower brightness.
      
      Here's the list of lights:
      ${this.lights()
        .map((light) => `${light.id}: ${light.name}`)
        .join('\n')}

      Your response must be a JSON array of objects with the following shape:
      {
        lightId: string,
        brightness: number
      }

      Do not include any other text in your response.
    `
    ),
    outputSchema: z.array(
      z.object({ lightId: z.string(), brightness: z.number() })
    ),
    model: 'gpt-4o-mini',
    temperature: 0.5,
    maxTokens: 1000,
  });

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
      })
    );
  }
}
