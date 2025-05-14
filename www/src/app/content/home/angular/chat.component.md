```ts
@Component({
  template: `
     <app-simple-chat-message [messages]="chat.value()" />
     <app-chat-composer (sendMessage)="sendMessage($event)" />
   `,
}) export class ChatComponent {
  chat = chatResource({
    model: 'gpt-4.1',
    messages: [
      {
        role: 'system',
        content: `
          You are a helpful assistant that can answer questions and help with tasks.
        `,
      },
    ],
    tools: [
      createTool({
        name: 'getUser',
        description: 'Get information about the current user',
        handler: () => {
          const auth = inject(AuthService);
          return auth.getUser();
        },
      }),
      createTool({
        name: 'getLights',
        description: 'Get the current lights',
        handler: () => lastValueFrom(this.smartHomeService.loadLights()),
      }),
      createToolWithArgs({
        name: 'controlLight',
        description: 'Control a light',
        schema: s.object('Control light input', {
          lightId: s.string('The id of the light'),
          brightness: s.number('The brightness of the light'),
        }),
        handler: (input) =>
          this.smartHomeService.controlLight(input.lightId, input.brightness)
      }),
    ],
  });

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
```
