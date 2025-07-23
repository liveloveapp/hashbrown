import { Component, input } from '@angular/core';
import { JsonPipe } from '@angular/common';

@Component({
  selector: 'spot-game-loop',
  imports: [JsonPipe],
  template: `
    <div>
      <h1>Game Loop</h1>

      <pre>{{ gameDescription() | json }}</pre>
    </div>
  `,
})
export class GameLoopComponent {
  gameDescription = input.required<{
    players: string[];
    rules: string;
    spotifyDeviceId: string;
  }>();
}
