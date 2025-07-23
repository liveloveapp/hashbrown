import { Component, effect, inject, input } from '@angular/core';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { McpServerService } from '../services/mcp-server';
import { SongPickerViewComponent } from './song-picker-view.component';
import { PlayerTurnComponent } from './player-turn';
import { s } from '@hashbrownai/core';

@Component({
  selector: 'spot-game-loop',
  imports: [RenderMessageComponent],
  template: `
    @let message = gameMaster.lastAssistantMessage();

    @if (message) {
      <hb-render-message [message]="message" />
    }
  `,
})
export class GameLoopComponent {
  mcp = inject(McpServerService);
  gameDescription = input.required<{
    players: string[];
    rules: string;
    spotifyDeviceId: string;
  }>();

  gameMaster = uiChatResource({
    model: 'gpt-4.1',
    debugName: 'Game Master',
    system: `
      You are the game master for a user-defined Spotify playlist game.
      The user has already defined the game rules, spotify device to use,
      and the list of players. Your responsibility is to show the right
      game screen and manage the game flow.
    `,
    components: [
      exposeComponent(SongPickerViewComponent, {
        description: `
          A view that lets a player pick a song from the play list. This
          must always be a child of the <spot-player-turn> component.
        `,
        input: {
          constraint: s.string(
            'The constraint that the player must pick a song that matches.',
          ),
        },
      }),
      exposeComponent(PlayerTurnComponent, {
        description: `
          Starts a player's turn. 
        `,
        input: {
          player: s.string(
            'The name of the player that is starting their turn.',
          ),
        },
      }),
    ],
    tools: [...this.mcp.tools()],
  });

  constructor() {
    effect(() => {
      this.gameMaster.sendMessage({
        role: 'user',
        content: `game_rules:\n${JSON.stringify(this.gameDescription())}`,
      });
    });
  }
}
