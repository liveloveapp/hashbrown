import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute, Router } from '@angular/router';
import { SmartHomeService } from '../../services/smart-home.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { LightsPageActions } from './actions/lights-page.actions';
import { Store } from '@ngrx/store';

@Component({
  selector: 'app-light-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCardModule,
  ],
  template: `
    <div class="form-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title
            >{{ isEditing() ? 'Edit' : 'Add' }} Light</mat-card-title
          >
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="fill">
              <mat-label>Name</mat-label>
              <input matInput formControlName="name" />
              @if (form.get('name')?.errors?.['required'] &&
              form.get('name')?.touched) {
              <mat-error>Name is required</mat-error>
              }
            </mat-form-field>

            <div class="actions">
              <button mat-button type="button" routerLink="/lights">
                Cancel
              </button>
              <button
                mat-raised-button
                color="primary"
                type="submit"
                [disabled]="!form.valid"
              >
                {{ isEditing() ? 'Save' : 'Add' }}
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .form-container {
        padding: 20px;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
    `,
  ],
})
export class LightFormComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private smartHome = inject(SmartHomeService);
  private store = inject(Store);

  protected form = this.fb.group({
    name: ['', Validators.required],
  });

  protected isEditing = toSignal(
    this.route.params.pipe(map((params) => Boolean(params['id'])))
  );

  constructor() {
    const id = this.route.snapshot.params['id'];
    if (id) {
      const light = this.smartHome.lights().find((l) => l.id === id);
      if (light) {
        this.form.patchValue({
          name: light.name,
        });
      }
    }
  }

  protected onSubmit() {
    if (this.form.valid) {
      const id = this.route.snapshot.params['id'];
      const formValue = this.form.value;
      const name = formValue.name;

      if (!name) {
        throw new Error('Name is required');
      }

      if (id) {
        this.store.dispatch(
          LightsPageActions.updateLight({
            id,
            changes: {
              name,
            },
          })
        );
      } else {
        this.store.dispatch(
          LightsPageActions.addLight({
            light: {
              name,
            },
          })
        );
      }
    }
  }
}
