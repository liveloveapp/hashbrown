import { Component, inject } from '@angular/core';
import {
  createTool,
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { LoginViewComponent } from './login-view';
import { PlayersViewComponent } from './players-view';
import { GamesRulesViewComponent } from './games-rules-view';
import { GameLoopComponent } from '../game-loop/game-loop';
import { ConnectToDeviceViewComponent } from './connect-to-device-view';
import { SpotifyService } from '../services/spotify';
import { ChatService } from '../services/chat';
import { s } from '@hashbrownai/core';
import { McpServerService } from '../services/mcp-server';
import { LoaderComponent } from '../loader';

@Component({
  selector: 'spot-game-setup',
  imports: [RenderMessageComponent, LoaderComponent],
  template: `
    @let message = ui.lastAssistantMessage();

    @if (ui.isLoading()) {
      <spot-loader />
    }

    @if (message) {
      <hb-render-message [message]="message" />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      height: 100%;

      > hb-render-message {
        flex: 1 auto;
      }
    }
  `,
  providers: [{ provide: ChatService, useExisting: GameSetupComponent }],
})
export class GameSetupComponent implements ChatService {
  mcp = inject(McpServerService);
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

       # Auth
       Call the is_authenticated tool to check if the user is authenticated with Spotify.
       If the user is not authenticated, show the login view.

       # Device
       Call the list_devices tool to get a list of devices. If there's exactly one device,
       skip the device view and go to the next step. Otherwise, show the connect to device view.

       # Rules
       After the user has connected to a device, ask the user for the rules of the game. Show
       them the games-rules view.

       # Players
       After the user has connected to a device and has described the rules of the game,
       ask the user for the players playing the game. Show them the players view.

       # Game Loop
       After the user has connected to a device, has described the rules of the game, and has added the players,
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
        input: {
          devices: s.array(
            'The list of devices the user can connect to',
            s.object('Device', {
              deviceId: s.string('The device ID'),
              name: s.string('The device name'),
              materialSymbolIcon: s.string(
                'The material symbol icon that best represents the device',
              ),
            }),
          ),
        },
      }),
      exposeComponent(GameLoopComponent, {
        description: 'Once everything is configured, this starts the game loop',
        input: {
          gameDescription: s.object('The description of the game', {
            players: s.array(
              'The players playing the game',
              s.string('The player name'),
            ),
            rules: s.string('The rules of the game'),
            spotifyDeviceId: s.string('The Spotify device ID'),
          }),
        },
      }),
    ],
    tools: [
      ...this.mcp.tools(),
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
