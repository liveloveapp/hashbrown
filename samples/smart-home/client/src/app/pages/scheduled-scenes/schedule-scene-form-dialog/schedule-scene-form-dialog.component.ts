import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormControl,
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
import { Store } from '@ngrx/store';
import { Scene } from '../../../models/scene.model';
import { selectAllScenes } from '../../../store';
import { ScheduledScene, Weekday } from '../../../models/scheduled-scene.model';

@Component({
  selector: 'app-schedule-scene-form-dialog',
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
    <h2 mat-dialog-title>{{ data ? 'Edit' : 'Add' }} Scheduled Scene</h2>
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

        <mat-form-field>
          <mat-label>Scene</mat-label>
          <mat-select formControlName="sceneId">
            <mat-option value="">Select a scene</mat-option>
            @for (scene of scenes(); track scene.id) {
              <mat-option [value]="scene.id">{{ scene.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Start Date</mat-label>
          <input matInput type="datetime-local" formControlName="startDate" />
        </mat-form-field>

        <span>Recurrence</span>
        <div
          *ngFor="let checkbox of checkboxesFormArray.controls; let i = index"
        >
          <input
            type="checkbox"
            [formControl]="checkbox"
            id="checkbox-{{ i }}"
          />
          <label for="checkbox-{{ i }}">{{ weekdays[i] | titlecase }}</label>
        </div>
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
    `,
  ],
})
export class ScheduleSceneFormDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ScheduleSceneFormDialogComponent>);
  protected data = inject<ScheduledScene | undefined>(MAT_DIALOG_DATA);
  protected store = inject(Store);
  scenes = this.store.selectSignal(selectAllScenes);
  protected form = this.fb.group({
    name: ['', Validators.required],
    sceneId: ['', Validators.required],
    startDate: ['', Validators.required],
    weekdays: this.fb.array([]),
  });

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  scheduledSceneNameSignal = toSignal(this.form.get('name')!.valueChanges);

  constructor() {
    if (this.data) {
      this.form.patchValue({
        name: this.data.name,
        sceneId: this.data.sceneId,
        startDate: this.data.startDate.toString(),
        weekdays: this.data.recurrenceRule?.weekdays ?? [],
      });
    }
  }

  readonly weekdays: Weekday[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];

  addCheckboxes() {
    this.weekdays.forEach(() =>
      this.checkboxesFormArray.push(new FormControl(false)),
    );
  }

  get checkboxesFormArray() {
    return this.form.get('weekdays') as FormArray<FormControl>;
  }

  ngOnInit() {
    this.addCheckboxes();
  }

  newScheduledScene = {
    name: '',
    sceneId: '',
    startDate: '',
    recurrenceRule: {
      weekdays: [] as Weekday[],
    },
    isEnabled: true,
  };

  // toggleWeekday(weekday: Weekday) {
  //   const weekdays = this.newScheduledScene.recurrenceRule.weekdays;
  //   const index = weekdays.indexOf(weekday);

  //   if (index === -1) {
  //     weekdays.push(weekday);
  //   } else {
  //     weekdays.splice(index, 1);
  //   }
  // }
}
