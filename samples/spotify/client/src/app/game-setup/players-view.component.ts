import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ChatService } from '../services/chat';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'spot-players-view',
  template: `
    <div>
      <h1>Players</h1>

      <form (ngSubmit)="onSubmit($event)">
        <div>
          @for (player of playersFormArray.controls; track player.value) {
            <input type="text" [formControl]="player" />
          }
          <button type="button" (click)="addPlayer()">Add Player</button>
        </div>
        <button type="submit" (click)="onSubmit($event)">Submit</button>
      </form>
    </div>
  `,
  styles: ``,
})
export class PlayersViewComponent {
  chat = inject(ChatService);
  playersFormArray = new FormArray<FormControl<string>>(
    [
      new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    ],
    { validators: [this.atLeastOnePlayer] },
  );

  addPlayer() {
    this.playersFormArray.push(
      new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    );
  }

  private atLeastOnePlayer(): ValidatorFn {
    return (control: AbstractControl) => {
      if (control instanceof FormArray) {
        return control.length > 0 ? null : { atLeastOnePlayer: true };
      }
      return null;
    };
  }

  onSubmit(event: Event) {
    event.preventDefault();

    console.log(this.playersFormArray.value);

    const players = this.playersFormArray.value.filter(Boolean);
    this.chat.sendMessage(`confirm_players:\n${players.join('\n')}`);
  }
}
