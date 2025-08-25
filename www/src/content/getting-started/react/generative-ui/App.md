```tsx
import { useChat, exposeComponent, s } from '@hashbrownai/react';

export function App() {
  /**
   * 1. Define a list of components
   */
  const components = [
    exposeComponent(LoginView, {
      description: 'Shows a login button to the user',
    }),
    exposeComponent(PlayersView, {
      description: 'Lets the players add or remove players',
    }),
    exposeComponent(GamesRulesView, {
      description: 'Lets the players describe the rules of the music game',
    }),
    exposeComponent(ConnectToDeviceView, {
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
    exposeComponent(GameLoop, {
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
  ];

  /**
   * 2. Prompt the model with our components
   */
  const {
    messages,
    sendMessage,
    lastAssistantMessage,
    isSending,
    isReceiving,
  } = useUiChat({
    model: 'gpt-5',
    system: 'Build a Spotify playlist app',
    components,
  });

  /**
   * 3. Render the last assistant message
   */
  return (
    <div>
      {(isSending || isReceiving) && <Loader />}
      {lastAssistantMessage && <RenderMessage message={lastAssistantMessage} />}
    </div>
  );
}
```
