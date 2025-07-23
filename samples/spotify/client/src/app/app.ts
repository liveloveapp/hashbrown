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
      <div class="login">
        <button (click)="loginAndConnect()">Login with Spotify</button>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      height: 100%;
    }

    .login {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 64px;

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
  `,
})
export class App {
  mcp = inject(McpServerService);
  spotify = inject(SpotifyService);

  async loginAndConnect() {
    await this.spotify.login();
    await this.mcp.connect();
  }
}
