import { Component, inject } from '@angular/core';
import {
  createTool,
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { LoginViewComponent } from './login-view.component';
import { PlayersViewComponent } from './players-view.component';
import { GamesRulesViewComponent } from './games-rules-view.component';
import { GameLoopComponent } from '../game-loop/game-loop';
import { ConnectToDeviceViewComponent } from './connect-to-device-view.component';
import { SpotifyService } from '../services/spotify';
import { ChatService } from '../services/chat';

@Component({
  selector: 'spot-game-setup',
  imports: [RenderMessageComponent],
  template: `
    @let message = ui.lastAssistantMessage();

    @if (message) {
      <hb-render-message [message]="message" />
    }
  `,
  providers: [{ provide: ChatService, useExisting: GameSetupComponent }],
})
export class GameSetupComponent implements ChatService {
  ui = uiChatResource({
    model: 'gpt-4.1',
    debugName: 'Game Setup',
    system: `
      You are a helpful assistant that helps users set up a Spotify playlist
      music game. Your goal is to collect enough information from the user to
      start the game loop.

      To start a game, we need the following information:
       1. Is the user authenticated with Spotify?
       2. What Spotify device is the game going to be played on?
       3. What are the rules of the game?
       4. Who are the players playing the game?
    `,
    messages: [{ role: 'user', content: 'help me setup the game' }],
    components: [
      exposeComponent(LoginViewComponent, {
        description: 'Shows a login button to the user',
      }),
      exposeComponent(PlayersViewComponent, {
        description: 'Lets the players add or remove players',
      }),
      exposeComponent(GamesRulesViewComponent, {
        description: 'Lets the players describe the rules of the music game',
      }),
      exposeComponent(ConnectToDeviceViewComponent, {
        description:
          'Lets the players connect to a device if one is not available',
      }),
      exposeComponent(GameLoopComponent, {
        description: 'Once everything is configured, this starts the game loop',
      }),
    ],
    tools: [
      createTool({
        name: 'is_authenticated',
        description: 'Check if the user is authenticated with Spotify',
        handler: async () => {
          const spotify = inject(SpotifyService);

          return { authenticated: spotify.isAuthenticated() };
        },
      }),
    ],
  });

  sendMessage(message: string): void {
    this.ui.sendMessage({ role: 'user', content: message });
  }
}
