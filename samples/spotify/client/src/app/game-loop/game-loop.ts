import { Component, effect, inject, input } from '@angular/core';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { McpServerService } from '../services/mcp-server';
import { SongPickerViewComponent } from './song-picker-view';
import { PlayerTurnComponent } from './player-turn';
import { s } from '@hashbrownai/core';
import { ChatService } from '../services/chat';

@Component({
  selector: 'spot-game-loop',
  imports: [RenderMessageComponent],
  template: `
    @let message = gameMaster.lastAssistantMessage();

    @if (message) {
      <hb-render-message [message]="message" />
    }
  `,
  providers: [
    {
      provide: ChatService,
      useExisting: GameLoopComponent,
    },
  ],
})
export class GameLoopComponent implements ChatService {
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

      When a song is selected, queue it on the spotify device then advance
      the turn order.

      NEVER show more than one player turn at a time.

      Pick unique colors for each player to use in the UI. Base the colors
      on the following color palette:
       - sunshine-yellow: #fbbb52;
       - sky-blue: #64afb5;
       - sunset-orange: #e88c4d;
       - olive-green: #616f36;
       - indian-red: #b86060;
       - chocolate-brown: #774625;
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
        children: 'any',
        description: `
          Show a player's turn. Only show one player turn at a time, for the
          player that is currently in their turn.
        `,
        input: {
          player: s.string(
            'The name of the player that is starting their turn.',
          ),
          color: s.string(
            'The color of the player that is starting their turn.',
          ),
          darkenedColor: s.string(
            'The darkened color of the player that is starting their turn.',
          ),
        },
      }),
    ],
    tools: [...this.mcp.tools().filter((tool) => tool.name === 'queue_track')],
  });

  constructor() {
    effect(() => {
      this.gameMaster.sendMessage({
        role: 'user',
        content: `game_rules:\n${JSON.stringify(this.gameDescription())}`,
      });
    });
  }

  sendMessage(message: string) {
    this.gameMaster.sendMessage({
      role: 'user',
      content: message,
    });
  }
}
