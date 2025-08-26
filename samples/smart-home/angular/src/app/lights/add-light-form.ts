import {
  Component,
  computed,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { completionResource } from '@hashbrownai/angular';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { SmartHome } from '../smart-home';

@Component({
  selector: 'app-add-light-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
  ],
  template: `
    <h2 mat-dialog-title>Add Light</h2>
    <mat-dialog-content>
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
            form.get('name')?.errors?.['required'] && form.get('name')?.touched
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
          <button mat-button type="button" (click)="onCancel()">Cancel</button>
          <button
            mat-raised-button
            color="primary"
            type="submit"
            [disabled]="!form.valid"
          >
            Add
          </button>
        </div>
      </form>
    </mat-dialog-content>
  `,
  styles: [
    `
      form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 400px;
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
        color: rgba(255, 255, 255, 0.5);
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
export class AddLightForm {
  readonly smartHome = inject(SmartHome);
  readonly dialogRef = inject(MatDialogRef<AddLightForm>);
  readonly nameControl = new FormControl('', [Validators.required]);
  readonly form = new FormGroup({
    name: this.nameControl,
  });
  readonly nameSignal = toSignal(this.nameControl.valueChanges);
  readonly lightNames = computed(() =>
    this.smartHome.lights().map((light) => light.name),
  );

  readonly nameCompletion = completionResource({
    model: 'gpt-4.1-mini',
    system: `
      You are an assistant that helps the user finish typing a name for a light.
      They are using a web app to add a new light to their home. Each time
      the user types in the light name field, predict the exact characters
      they are likely to append next. The input includes the user's current
      input and the list of names they have already used.

      # Rules
      - Return only the text to append; include no extra words or quotation marks.
      - Preserve all punctuation exactly as it should follow the input.
      - Ensure spacing is correct:
          - Do not trim leading or trailing whitespace in your suggestion.
          - If your suggestion begins with a letter or punctuation and the user's
            input does not already end with a space, start your suggestion with a space.
      - If the name is already complete, return an empty string.
      - NEVER predict more than a few words or characters at a time.
      - Names must be unique.
    `,
    input: computed(() => {
      if (!this.nameSignal()) return null;

      return {
        input: this.nameSignal(),
        existingNames: this.lightNames(),
      };
    }),
  });

  readonly nameInputRef = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  protected lostService = computed(
    () => this.nameCompletion.status() === 'error',
  );

  protected onCancel() {
    this.dialogRef.close();
  }

  protected onSubmit() {
    if (this.form.valid) {
      const formValue = this.form.value;
      const name = formValue.name;

      if (!name) {
        throw new Error('Name is required');
      }

      this.smartHome.addLight({ name, brightness: 100 });
    }
  }

  protected completeName(_event: Event): void {
    const event = _event as KeyboardEvent;
    event.preventDefault();
    const suggestion = this.nameCompletion.value();
    if (suggestion) {
      const current = this.nameControl.value || '';
      const updated = current + suggestion;
      this.nameControl.setValue(updated);

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
