```ts
chat = uiChatResource({
  // model: 'gemini-2.5-pro-exp-03-25',
  model: 'gpt-4o',
  messages: [
    {
      role: 'system',
      content: `
          You are a helpful assistant that can answer questions and help with tasks.
        `,
    },
  ],
  components: [
    exposeComponent(MarkdownComponent, {
      name: 'markdown',
      description: 'Show markdown to the user',
      props: {
        data: s.streaming.string('The markdown content'),
      },
    }),
    exposeComponent(LightCardComponent, {
      name: 'light',
      description: 'Show a light to the user',
      props: {
        lightId: s.string('The id of the light'),
      },
    }),
    exposeComponent(CardComponent, {
      name: 'card',
      description: 'Show a card to the user',
      children: 'any',
      props: {
        title: s.streaming.string('The title of the card'),
      },
    }),
  ],
  tools: [
    createTool({
      name: 'getUser',
      description: 'Get information about the current user',
      handler: () => lastValueFrom(this.authService.getUser()),
    }),
    createTool({
      name: 'getLights',
      description: 'Get the current lights',
      handler: () => lastValueFrom(this.smartHomeService.loadLights()),
    }),
  ],
});
```
