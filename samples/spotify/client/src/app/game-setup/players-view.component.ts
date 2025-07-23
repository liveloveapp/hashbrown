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
    <div class="container">
      <h1>Players</h1>

      <form (ngSubmit)="onSubmit($event)">
        <div class="players">
          @for (player of playersFormArray.controls; track player.value) {
            <input type="text" [formControl]="player" />
          }
          <button type="button" (click)="addPlayer()">Add Player</button>
        </div>
        @if (playersFormArray.valid) {
          <button type="submit" (click)="onSubmit($event)">Submit</button>
        }
      </form>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      height: 100%;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      height: 100%;
      padding: 64px;
      gap: 64px;

      > h1 {
        font:
          600 24px/32px 'Fredoka',
          sans-serif;
        text-align: center;
      }

      > form {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 16px;

        > .players {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 16px;

          > input {
            border-radius: 16px;
            border: 4px solid var(--sunshine-yellow-light);
            background: #faf9f0;
            padding: 8px;
            font:
              400 16px/24px 'Fredoka',
              sans-serif;
          }

          > button {
            margin: 0 auto;
            display: flex;
            justify-content: center;
            align-items: center;
            align-self: flex-start;
            color: rgba(255, 255, 255, 0.88);
            font:
              500 18px/24px 'Fredoka',
              sans-serif;
            padding: 12px 24px;
            border-radius: 48px;
            border: 6px solid #e8a23d;
            background: #e88c4d;
            cursor: pointer;
            transition:
              color 0.2s ease-in-out,
              border 0.2s ease-in-out;

            &:hover {
              color: #fff;
            }
          }
        }

        > button {
          margin: 0 auto;
          display: flex;
          justify-content: center;
          align-items: center;
          align-self: flex-start;
          color: rgba(255, 255, 255, 0.88);
          font:
            500 18px/24px 'Fredoka',
            sans-serif;
          padding: 12px 24px;
          border-radius: 48px;
          border: 6px solid #e8a23d;
          background: #e88c4d;
          cursor: pointer;
          transition:
            color 0.2s ease-in-out,
            border 0.2s ease-in-out;

          &:hover {
            color: #fff;
          }
        }
      }
    }
  `,
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
