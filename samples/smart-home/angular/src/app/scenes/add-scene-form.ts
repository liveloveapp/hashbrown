import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
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
import { SmartHome } from '../smart-home';
import { Scene } from '../types';
import { LightPredictor } from './light-predictor';
import { RRuleParser } from './rrule-parser';
import { RruleVisualization } from './rrule-visualization/rrule-visualization';

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
    RruleVisualization,
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

        <mat-form-field appearance="fill">
          <mat-label>When should this scene run?</mat-label>
          <input matInput formControlName="rrule" />
        </mat-form-field>

        @if (rruleParserResult.isLoading()) {
          <div class="rrule-loading">
            <mat-icon inline>hourglass_empty</mat-icon>
            Parsing...
          </div>
        }

        @if (rruleParserResult.schedule(); as schedule) {
          <app-rrule-visualization [schedule]="schedule" />
        } @else if (rruleParserResult.error(); as parseError) {
          <div class="rrule-error">
            <mat-icon inline>error</mat-icon>
            <span>{{ parseError.error }}</span>
          </div>
        }

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

        @if (predictedLightsResult.predictedLights().length) {
          <h5>
            <mat-icon aria-hidden="true" inline>bolt</mat-icon>
            Suggestions
          </h5>
          @for (
            light of predictedLightsResult.predictedLights();
            track light.lightId
          ) {
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

        @if (predictedLightsResult.error()) {
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
  styles: `
    h2 {
      padding-bottom: 0;
    }

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
      padding: 0 0 16px 0;
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

    .rrule-loading {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    app-rrule-visualization {
      display: block;
    }

    .rrule-error {
      display: flex;
      align-items: center;
      gap: 8px;
      background-color: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      padding: 12px 16px;
      border-radius: 16px;

      mat-icon {
        flex-shrink: 0;
      }
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
})
export class AddSceneForm {
  readonly dialogRef = inject(MatDialogRef<AddSceneForm>);
  readonly smartHome = inject(SmartHome);
  readonly lightPredictor = inject(LightPredictor);
  readonly rruleParser = inject(RRuleParser);
  readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly rruleControl = new FormControl('');
  readonly lightsArrayControl = new FormArray<
    FormGroup<{
      lightId: FormControl<string>;
      brightness: FormControl<number>;
    }>
  >([]);
  readonly form = new FormGroup({
    name: this.nameControl,
    rrule: this.rruleControl,
    lights: this.lightsArrayControl,
  });
  readonly sceneNameSignal = toSignal(this.nameControl.valueChanges);
  readonly rruleSignal = toSignal(this.rruleControl.valueChanges);

  /**
   * --------------------------------------------------------------------------
   * Predicted Lights Resource
   * --------------------------------------------------------------------------
   */
  readonly predictedLightsResult = this.lightPredictor.predictLights(
    this.sceneNameSignal,
  );

  /**
   * --------------------------------------------------------------------------
   * RRule Parser Resource
   * --------------------------------------------------------------------------
   */
  readonly rruleParserResult = this.rruleParser.parse(this.rruleSignal);

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
    this.predictedLightsResult.predictedLights.update((lights) =>
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
