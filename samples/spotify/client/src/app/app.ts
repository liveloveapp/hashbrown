import { Component, inject } from '@angular/core';
import { GameSetupComponent } from './game-setup/game-setup';
import { McpServerService } from './services/mcp-server';
import { SpotifyService } from './services/spotify';

@Component({
  imports: [GameSetupComponent],
  selector: 'spot-root',
  template: `
    @if (spotify.accessToken() && mcp.connected()) {
      <spot-game-setup></spot-game-setup>
    } @else {
      <div>
        <h1>Spotify</h1>
        <button (click)="loginAndConnect()">Login</button>
      </div>
    }
  `,
  styles: ``,
})
export class App {
  mcp = inject(McpServerService);
  spotify = inject(SpotifyService);

  async loginAndConnect() {
    await this.spotify.login();
    await this.mcp.connect();
  }
}
