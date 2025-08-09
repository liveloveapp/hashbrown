```ts
import { exposeComponent, uiChatResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

@Component({
  template: `
    @if (ui.lastAssistantMessage()) {
      <hb-render-message [message]="ui.lastAssistantMessage()" />
    }
  `,
})
export class App {
  ui = uiChatResource({
    model: 'gpt-5',
    system: `Build a Spotify playlist app`,
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
        description: 'Lets the players connect to a device if one is not available',
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
            players: s.array('The players playing the game', s.string('The player name')),
            rules: s.string('The rules of the game'),
            spotifyDeviceId: s.string('The Spotify device ID'),
          }),
        },
      }),
    ],
  });

  sendMessage(message: string): void {
    this.ui.sendMessage({ role: 'user', content: message });
  }
}
```
