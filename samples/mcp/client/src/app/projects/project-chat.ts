import {
  Component,
  inject,
  Injector,
  input,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { Chat, fryHashbrown, s } from '@hashbrownai/core';
import {
  chatResource,
  ChatResourceRef,
  createRuntime,
  createRuntimeFunction,
  createToolJavaScript,
} from '@hashbrownai/angular';

@Component({
  selector: 'app-project-chat',
  template: `
    <input
      type="text"
      [value]="input()"
      #inputRef
      (input)="input.set(inputRef.value)"
    />
    <button (click)="chat?.sendMessage({ role: 'user', content: input() })">
      Send
    </button>

    @for (message of chat?.value(); track $index) {
      <div class="message">{{ message.content }}</div>
    }
  `,
  styles: `
    .message {
      padding: 10px;
      border-radius: 5px;
      background-color: #f0f0f0;
      margin-bottom: 10px;
    }
  `,
})
export class ProjectChatComponent {
  tools = input.required<Chat.AnyTool[]>();
  input = signal('');
  chat: ChatResourceRef<Chat.AnyTool> | null = null;
  injector = inject(Injector);
  runtime = createRuntime({
    timeout: 20_000,
    functions: [
      createRuntimeFunction({
        name: 'getCompletion',
        description: `
          Synchronously uses gpt-4.1-mini to get a completion for the given prompt
          and input data.
        `,
        args: s.object('The args for the function', {
          system: s.string('The system prompt to use'),
          input: s.string('The input data to use'),
        }),
        result: s.string('The completion'),
        handler: ({ system, input }, abortSignal) => {
          const hashbrown = fryHashbrown({
            apiUrl: '/api/chat',
            model: 'gpt-4.1-mini',
            system,
            messages: [{ role: 'user', content: input }],
          });

          const teardown = hashbrown.sizzle();

          return new Promise<string>((resolve, reject) => {
            const unsubscribe = hashbrown.messages.subscribe((messages) => {
              const assistantMessage = messages.find(
                (m) => m.role === 'assistant',
              );
              if (assistantMessage && assistantMessage.content) {
                resolve(assistantMessage.content);
              }
              const errorMessage = messages.find((m) => m.role === 'error');
              if (errorMessage) {
                reject(errorMessage.content);
                teardown();
              }
            });

            abortSignal?.addEventListener('abort', () => {
              unsubscribe();
              teardown();
            });
          });
        },
      }),
      createRuntimeFunction({
        name: 'getLyrics',
        description: 'Get the lyrics of a song using Genius',
        args: s.object('The args for the function', {
          title: s.string('The title of the song'),
          artist: s.string('The artist of the song'),
        }),
        result: s.string('The lyrics of the song'),
        handler: async ({ title, artist }, abortSignal) => {
          const req = await fetch(
            `http://localhost:3400/lyrics?searchTerm=${`${title} by ${artist}`}`,
            {
              signal: abortSignal,
            },
          );
          const lyrics = await req.text();
          console.log(lyrics);
          return lyrics;
        },
      }),
    ],
  });

  aToZDescription = `
          They are going to play a game called "A to Z", where each song must start
          with the next letter in the alphabet. THe first player gets "A", then
          "B", then "C", etc. If the user picks a song that doesn't start with the next letter in the
          alphabet, refuse the request. If they make a funny or comical argument for
          why it should be allowed, allow it.
  `;

  beatlesGameDescription = `
    They are going to play a game called "Beatles", where each song must be a Beatles song.
    If the user picks a song that is not a Beatles song, refuse the request. If they make a funny or
    comical argument for why it should be allowed, allow it.
  `;

  hipHopOnlyDescription = `
    They are going to play a game called "Hip Hop Only", where each song must be a hip hop song.
    If the user picks a song that is not a hip hop song, refuse the request. If they make a funny or
    comical argument for why it should be allowed, allow it.
  `;

  wordLinkDescription = `
    They are going to play a game called "Word Link", where each song must contain one word in
    common with the previous song. First player gets to start it off with any song. Each player
    gets three chances to pick a song. If they fail, eliminate them from the game. Keep going
    until there is a winner.
  `;

  foodGameDescription = `
    They are going to play a game called "Food", where each song must mention food.
    If the user picks a song that does not mention food, refuse the request. If they make a funny or
    comical argument for why it should be allowed, allow it. Always use the "javascript" tool to verify
    lyrics before queueing the song. 
  `;

  ngOnInit() {
    console.log(this.tools());
    this.chat = runInInjectionContext(this.injector, () =>
      chatResource({
        model: 'gpt-4.1',
        debugName: 'spotify-mcp-server',
        tools: [
          ...this.tools(),
          createToolJavaScript({
            runtime: this.runtime,
          }),
        ],
        system: `
          You are the game master for a music game. This device is connected to
          the aux cord, and it's going to be passed around to different players.
          
          # Game

          ${this.foodGameDescription}

          # Queueing
          You are going to help them find the next song to play, and then
          queue it up.

          The players are: Mike, Brian, and Ben. Mike is the first player.

          # Tools
          * Once the song has been picked, you must queue the song using the "queue-track"
            tool.
          * Once the song is queued, you must say "Queued" and then the name of the song.
            Then tell the user to pass it to the next player by name, with instructions
            for which song to play next.
          * If queueing a song fails, that likely means there is not an active Spotify device.
            To solve this, use the "list-devices" tool to get the list of devices. If there is 
            only one device, use that one. If there are multiple devices, ask the user to select 
            a device.
          * Tool JavaScript is available to you. You can use it to ground your answers. Additionally,
            some games may require that you leverage AI to determine if a song selection is valid. For
            example, if the game is to select songs that mention food, you can use the "getLyrics"
            function in the VM to get the lyrics of the song and then use the "getCompletion" function
            to determine if the song mentions food.

            Example Script:
            <script>
              const lyrics = getLyrics({ title: 'Song Title', artist: 'Artist Name' });
              const completion = getCompletion({
                system: \`
                  You are a helpful assistant that can determine if a song mentions food.
                  Respond exactly with "true" or "false" if the song mentions food.
                \`,
                input: lyrics,
              });
              return completion;
            </script>
        `,
      }),
    );
  }
}
