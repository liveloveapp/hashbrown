import { Component, input, signal } from '@angular/core';

@Component({
  selector: 'spot-player-turn',
  template: `
    <div
      class="player-turn-preview"
      [class.hidden]="!hidden()"
      [style.backgroundColor]="color()"
    >
      <span class="player-name">{{ player() }}</span>
      <button
        (click)="hidden.set(false)"
        [style.backgroundColor]="darkenedColor()"
      >
        Start Turn
      </button>
    </div>
    <div class="player-turn-content" [class.hidden]="hidden()">
      <div class="player-turn-content-header" [style.backgroundColor]="color()">
        <span class="player-header-name">
          {{ player() }}
        </span>
      </div>
      <div class="player-turn-content-body">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: `
    .player-turn-preview {
      position: fixed;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;
      width: max(200vh, 200vw);
      height: max(200vh, 200vw);
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

    .player-turn-content {
      display: grid;
      grid-template-rows: auto 1fr;
      opacity: 1;
      transition: all 0.5s ease-in-out;
    }

    .player-turn-content.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .player-name {
      font-size: 48px;
      font-weight: 600;
    }

    .player-turn-content-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
    }

    .player-header-name {
      font-size: 24px;
      font-weight: 600;
    }

    button {
      border: none;
      outline: none;
      padding: 8px 16px;
      border-radius: 4px;
      color: white;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
    }
  `,
})
export class PlayerTurnComponent {
  player = input.required<string>();
  color = input.required<string>();
  darkenedColor = input.required<string>();
  hidden = signal(true);
}
