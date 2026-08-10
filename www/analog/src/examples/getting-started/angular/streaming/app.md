```ts
@Component({
  template: `
    <app-messages [messages]="chat.value()" />
    <app-composer (sendMessage)="sendMessage($event)" />
  `,
})
export class ChatComponent {
  chat = chatResource({
    model: 'gpt-5',
    system: `
      You are a helpful assistant that can answer questions and help with tasks.
    `,
    tools: [
      createTool({
        name: 'getUser',
        description: 'Get information about the current user',
        handler: () => {
          const auth = inject(AuthService);
          return auth.getUser();
        },
      }),
    ],
  });

  sendMessage(message: string) {
    this.chat.sendMessage({ role: 'user', content: message });
  }
}
```
