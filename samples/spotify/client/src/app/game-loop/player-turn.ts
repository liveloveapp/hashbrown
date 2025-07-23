import { Component, input } from '@angular/core';

@Component({
  selector: 'spot-player-turn',
  template: `
    <div>
      <h1>Player Turn: {{ player() }}</h1>
      <ng-content></ng-content>
    </div>
  `,
})
export class PlayerTurnComponent {
  player = input.required<string>();
}
