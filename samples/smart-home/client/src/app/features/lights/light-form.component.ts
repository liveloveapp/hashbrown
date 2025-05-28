/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  Component,
  computed,
  ElementRef,
  inject,
  ResourceStatus,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SmartHomeService } from '../../services/smart-home.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { LightsPageActions } from './actions/lights-page.actions';
import { Store } from '@ngrx/store';
import { completionResource } from '@hashbrownai/angular';
import { MatIconModule } from '@angular/material/icon';

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
    RouterModule,
    MatIconModule,
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
            <mat-form-field appearance="fill" class="autocomplete-container">
              <mat-label>Name</mat-label>
              <div class="ghost-input">
                <span class="current-input">{{ form.get('name')?.value }}</span>
                <span class="completion">{{ nameCompletion.value() }}</span>
              </div>
              <input
                matInput
                formControlName="name"
                (keydown.tab)="completeName($event)"
                #nameInput
              />
              @if (
                form.get('name')?.errors?.['required'] &&
                form.get('name')?.touched
              ) {
                <mat-error>Name is required</mat-error>
              }
            </mat-form-field>

            @if (lostService()) {
              <div class="error">
                <mat-icon inline>error</mat-icon>Assisted completion is not
                available.
              </div>
            }

            <div class="actions">
              <button mat-button type="button" [routerLink]="['/lights']">
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

      .autocomplete-container .mat-form-field-wrapper {
        position: relative;
      }

      mat-card-title {
        margin-bottom: 8px;
      }

      .autocomplete-container .ghost-input {
        position: absolute;
        bottom: 8px;
        left: 0;
        width: 100%;
        border: none;
        background: transparent;
        pointer-events: none;
        padding: 0;
      }

      .ghost-input .current-input {
        color: transparent;
      }

      .ghost-input .completion {
        color: rgba(0, 0, 0, 0.5);
        font-style: italic;
      }

      .autocomplete-container input.mat-input-element {
        position: relative;
        background: transparent;
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
export class LightFormComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private smartHome = inject(SmartHomeService);
  private store = inject(Store);

  protected form = this.fb.group({
    name: ['', Validators.required],
  });

  protected nameSignal = toSignal(this.form.get('name')!.valueChanges);
  protected lightNames = this.smartHome.lights().map((l) => l.name);

  readonly nameCompletion = completionResource({
    model: 'gpt-4o-mini',
    input: this.nameSignal,
    system: computed(
      () => `
      Help the user generate a name for a light. The input will be what
      they have typed so far, and the output should be a prediction for
      the name of the light. Just give me the next bit of text to add to
      the name. Don't include any other text.
      
      If the name looks complete or sounds like a good name, just return
      an empty string. Don't forget to include a leading space if there's
      not a trailing space in the input and you are predicting a full word.

      Never include quote marks around your prediction.
      
      The user already has these lights in their home:
      ${this.lightNames.join(', ')}
    `,
    ),
  });

  readonly nameInputRef = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  protected isEditing = toSignal(
    this.route.params.pipe(map((params) => Boolean(params['id']))),
  );

  protected lostService = computed(
    () => this.nameCompletion.status() === ResourceStatus.Error,
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
          }),
        );
      } else {
        this.store.dispatch(
          LightsPageActions.addLight({
            light: {
              name,
            },
          }),
        );
      }

      this.router.navigate(['/lights']);
    }
  }

  protected completeName(_event: Event): void {
    const event = _event as KeyboardEvent;
    event.preventDefault();
    const suggestion = this.nameCompletion.value();
    if (suggestion) {
      const control = this.form.get('name');
      const current = control?.value || '';
      const updated = current + suggestion;
      control?.setValue(updated);
      // reposition cursor at end and maintain focus
      Promise.resolve().then(() => {
        const inputElRef = this.nameInputRef();
        if (inputElRef) {
          const inputEl = inputElRef.nativeElement;
          inputEl.focus();
          inputEl.setSelectionRange(updated.length, updated.length);
        }
      });
    }
  }
}
