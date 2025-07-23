import { Component, input, signal } from '@angular/core';

@Component({
  selector: 'spot-player-turn',
  template: `
    <div class="player-turn-preview" [class.hidden]="!hidden()">
      <span class="player-name">{{ player() }}</span>
      <button (click)="hidden.set(false)">Start Turn</button>
    </div>
    <div [class.hidden]="hidden()">
      <ng-content></ng-content>
    </div>
  `,
  styles: `
    .player-turn-preview {
      position: fixed;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: max(200vh, 200vw);
      height: max(200vh, 200vw);
      background-color: var(--sunshine-yellow);
      color: rgba(0, 0, 0, 0.6);
      transition: all 0.5s ease-in-out;
      transform-origin: center;
      top: 50%;
      left: 50%;
      margin-left: min(-100vw, -100vh);
      margin-top: min(-100vw, -100vh);
      border-radius: max(100vh, 100vw);
      opacity: 1;

      @starting-style {
        transform: scale(0);
      }
    }

    .player-turn-preview.hidden {
      opacity: 0;
      transform: scale(0);
      pointer-events: none;
    }
  `,
})
export class PlayerTurnComponent {
  player = input.required<string>();
  hidden = signal(true);
}
