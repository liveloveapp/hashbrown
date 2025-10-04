---
title: How We Built a Spotify Game App in 4 Hours on the Web Dev Challenge
slug: 2025-09-24-spotify-game-with-hashbrown
description: We had 30 minutes to plan and 4 hours to build a playable, turn‑based Spotify playlist game using MCP with the help of Postman live on camera for the web dev challenge.
tags:
  - story
  - sample
team:
  - brian
youtube: https://www.youtube.com/watch?v=gAeLTcxF-0o
---

We had 30 minutes to plan and 4 hours to build a playable, turn‑based Spotify playlist game, using MCP, with the [help of Postman](https://learning.postman.com/docs/postman-ai-developer-tools/mcp-requests/overview/), live on camera for the web dev challenge.

Mike and I were invited by Jason Lengstorf of CodeTV to participate in the [web dev challenge](https://www.youtube.com/playlist?list=PLz8Iz-Fnk_eTkZvSNWXW_TKZ2UwVirT2M), sponsored by Postman. The challenge was to create personal software – the kind of app that you want to build for your own life but just don't have the time to create. We were tasked with using Postman's new MCP tooling.

Here is what we built in 4 hours.

<hb-carousel>

  <img src="/blog/image/article/2025-09-24-wdc-1.avif" height="867" width="404" alt="Spotify app login screen" />
  <img src="/blog/image/article/2025-09-24-wdc-2.avif" height="867" width="404" alt="Game rules screen" />
  <img src="/blog/image/article/2025-09-24-wdc-3.avif" height="867" width="404" alt="Game rules explained screen" />
  <img src="/blog/image/article/2025-09-24-wdc-4.avif" height="867" width="404" alt="Game loop started and Mike's turn" /> 
  <img src="/blog/image/article/2025-09-24-wdc-5.avif" height="867" width="404" alt="Asking the model to suggest a song for the game" />
  <img src="/blog/image/article/2025-09-24-wdc-6.avif" height="867" width="404" alt="Brian's turn to pick a song" />

</hb-carousel>

---

## Source Code

- [Source code on GitHub](https://github.com/liveloveapp/hashbrown/tree/main/samples/spotify).

---

## The Prompt

A week or so before the recording, Jason shared with us the prompt:

> As developers, we can often identify lots of areas in our own lives that could be improved by a custom app — if only we had the time to build them. These days, AI coding workflows and tools like MCP servers make it much more feasible to build custom software for personal use only, so we’re challenging you to do exactly that.

---

## The Tool

We used [Postman to create a collection for an MCP server](https://learning.postman.com/docs/postman-ai-developer-tools/mcp-requests/overview/). If you've used Postman for API development and testing, then you're going to love their MCP server support. This tool made it a breaze for us to build and test a local MCP for the challenge.

---

## The Idea

We wanted a roadtrip-friendly music game you can play with friends using your own Spotify account and devices. Players take turns adding songs to a shared playlist based on the rules of the game — like "A to Z by song title" — with the LLM helping along the way.

<img src="/blog/image/article/2025-09-24-wdc-3-left.avif" height="867" width="404" style="align-self:center" />

The model should:

- guide the game setup: Spotify auth, device, rules, players
- run the game, one turn at a time
- provide help topick the next song - "suggest a song for me"
- validate picks against the rules
- queue selected tracks to your Spotify playlist

---

## Planning

During our 30-minute planning session we whiteboarded out the general app architecture.
We would:

- Create an MCP Server using the TypeScript SDK. The MCP server would use the newer streamable HTTP protocol. The MCP server would expose a few tools to the model.
- Build out the web app using 2 agents: one to handle the game setup and another for the game loop.
- Expose Angular components that the model can render in the web app based on the system instructions.

As a stretch goal, we planned to use Hashbrown's JavaScript runtime for song lyric validation.

---

## Agent 1: Game Setup

<hb-code-example header="game-setup.ts">

```ts
@Component({
  selector: 'spot-game-setup',
  imports: [RenderMessageComponent, LoaderComponent],
  template: `
    @let message = ui.lastAssistantMessage();

    @if (ui.isLoading()) {
      <spot-loader />
    }

    <!-- Render generated UI -->
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
  // 1. Inject the MCP service
  mcp = inject(McpServerService);

  // 2. Create the UI chat resource to connect to OpenAI
  ui = uiChatResource({
    model: 'gpt-4.1',

    // 3. The debug name enables the use of the Redux devtools
    debugName: 'Game Setup',

    // 4. Set the tone and provide the instruction to the model
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

    // 5. The initial message is hard coded here to kick things off
    messages: [{ role: 'user', content: 'help me setup the game' }],

    // 6. Expose Angular components to the model
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
            rules: s.string(`
              The public rules of the game.
            `),
            hiddenRules: s.string(`
              The hidden rules of the game.
            `),
            spotifyDeviceId: s.string('The Spotify device ID'),
          }),
        },
      }),
    ],

    // 7. Wire up the remote MCP tools alongside a tool to check if the user is authenticated
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
```

</hb-code-example>

Let's review the code above.

- First, we create a `uiChatResource` to connect to OpenAI's GPT-4.1 model.
- We set a `system` prompt that defines the role of the agent and the steps it needs to take to gather the required information.
- We expose a set of Angular components that the model can render to interact with the user.
- We wire up a few MCP tools, including a custom tool to check if the user is authenticated with Spotify.
- We kick off the conversation with an initial user message.

The goal of the system prompt is to get the game to a clean "ready to start" state by collecting four things:

1. Spotify authentication
2. target device
3. the game rules
4. the players

We expose a set of small, purpose‑built components to the AI:

- `LoginViewComponent`: shows "Login with Spotify" and reports back.
- `ConnectToDeviceViewComponent`: lists available devices and allows the the user to pick one.
- `GamesRulesViewComponent`: the user describes the game and we validate with `structuredCompletionResource` and produce `rules` and `hiddenRules`.
- `PlayersViewComponent`: simple reactive form for player names; validates at least one player.
- `GameLoopComponent`: is only rendered once everything above is ready, then we pass a typed `gameDescription` with `players`, `rules`, `hiddenRules`, and `spotifyDeviceId`.

Why a dedicated setup agent?

This allows us to build an agent that is focused and determinism.

This agent is optimized for gathering structured inputs and advancing through a linear flow. Its prompt is short, specific, and biased toward finishing setup without leaking "gameplay" concerns.

---

## Agent 2: Game Loop

Once the setup agent hands off the `gameDescription`, the game loop takes over.

<hb-code-example header="game-loop.ts">

```ts
@Component({
  selector: 'spot-game-loop',
  imports: [RenderMessageComponent],
  template: `
    @let message = gameMaster.lastAssistantMessage();

    <!-- Render generated UI -->
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
  // 1. Inject the MCP Service
  mcp = inject(McpServerService);

  // 2. The expected input from the game setup agent
  gameDescription = input.required<{
    players: string[];
    rules: string;
    hiddenRules: string;
    spotifyDeviceId: string;
  }>();

  // 3. Create the game master agent
  gameMaster = uiChatResource({
    model: 'gpt-4.1',

    // 4. The debug name enables the use of the Redux devtools
    debugName: 'Game Master',

    // 5. Set the tone and provide the instruction to the model
    system: `
      You are the game master for a user-defined Spotify playlist game.
      The user has already defined the game rules, spotify device to use,
      and the list of players. Your responsibility is to show the right
      game screen and manage the game flow.

      When a song is selected, queue it on the spotify device then advance
      the turn order.

      NEVER show more than one <spot-player-turn> component at a time.

      Be a playful game designer. You have public rules that you can share
      with the players, and hidden rules that you playfully hide from the
      user (though it is not important that you keep them hidden if asked).

      Pick unique colors for each player to use in the UI. Base the colors
      on the following color palette:
       - sunshine-yellow: #fbbb52;
       - sky-blue: #64afb5;
       - sunset-orange: #e88c4d;
       - olive-green: #616f36;
       - indian-red: #b86060;
       - chocolate-brown: #774625;
    `,

    // 6. Expose Angular components to the model
    components: [
      exposeComponent(SongPickerViewComponent, {
        description: `
          A view that where an AI agent collaborates with aa player 
          to pick a song from the play list. This must always be a 
          child of the <spot-player-turn> component.
        `,
        input: {
          constraint: s.string(`
            Your instructions to the AI agent on how to pick a song
            with the player.
          `),
          currentPlayer: s.string(
            'The name of the player that is currently in their turn.',
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

    // 7. Expose remote MCP tools to the model
    tools: [...this.mcp.tools().filter((tool) => tool.name === 'queue_track')],
  });

  constructor() {
    // 8. Send the game description to the model
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
```

</hb-code-example>

Let's review the code above.

- We create another `uiChatResource` to connect to OpenAI's GPT-4.1 model.
- We set a `system` prompt that defines the role of the agent and its responsibilities during the game.
- We expose two Angular components that the model can render to interact with the user during the game.
- We wire up the `queue_track` MCP tool to allow the model to queue selected tracks on the user's Spotify device.
- We send the `gameDescription` received from the setup agent to the game master to kick off the game.

Two important exposed components:

- `PlayerTurnComponent`: a quick "start turn" reveal animation where the design is tinted with a unique player color (that is picked by the AI from the provided palette).
- `SongPickerViewComponent`: a collaborative picker that accepts free‑form queries ("suggest a song for me") and constraints from the rules, and renders real, selectable songs from Spotify's collection.

---

## Grounding with MCP and Tools

<hb-code-example header="mcp-server.ts">

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SpotifyService } from './spotify';
import { Chat } from '@hashbrownai/core';
import { createTool } from '@hashbrownai/angular';

@Injectable({
  providedIn: 'root',
})
export class McpServerService {
  // 1. Define the MCP client
  client?: Client;

  // 2. We created a simple service that uses the Spotify JS SDK
  spotify = inject(SpotifyService);

  // 3. Track the connected state
  connected = signal(false);

  // 4. Define a signal that will contain all of the remote MCP tools
  tools = signal<Chat.AnyTool[]>([]);

  injector = inject(Injector);

  async connect() {
    this.client = new Client({
      name: 'spotify',
      version: '1.0.0',
      title: 'Spotify',
    });

    // 5. Connect to the remote MCP server passing along the spotify access token
    await this.client.connect(
      new StreamableHTTPClientTransport(new URL('http://localhost:5150/mcp'), {
        requestInit: {
          headers: {
            Authorization: `Bearer ${encodeURIComponent(
              JSON.stringify(this.spotify.accessToken()),
            )}`,
          },
        },
      }),
    );

    // 6. Map the remote MCP tools to hashbrown's `AnyTool` interface
    const { tools: mcpTools } = await this.client.listTools();
    const tools = mcpTools.map((tool) => {
      return runInInjectionContext(this.injector, () => {
        return createTool({
          name: tool.name,
          description: tool.description ?? '',
          schema: {
            ...tool.inputSchema,
            additionalProperties: false,
            required: Object.keys(tool.inputSchema.properties ?? []),
          },
          handler: async (input) => {
            const result = await this.client?.callTool({
              name: tool.name,
              arguments: input,
            });
            return result;
          },
        });
      });
    });

    this.tools.set(tools);

    this.connected.set(true);
  }
}
```

</hb-code-example>

This is a simple Angular service that connects to the local MCP server we created.

- First, we create a new `Client` instance with the name, version, and title of our MCP server.
- We connect to the MCP server using the `StreamableHTTPClientTransport`, passing in the URL of the MCP server and the user's Spotify access token in the headers.
- We list the available tools from the MCP server and create local tool handlers that call the remote tools.
- We store the tools in a signal for easy access.

The client connects with the user's access token and surfaces tools to the agents:

- `search`: find tracks to display as real `spot-song` components
- `queue_track`: queue the chosen track on the selected device
- `list_devices`: enumerate available playback devices

---

## Stretch Goal: Lyrics Validation using JS Runtime

Once we wrapped up the primary objectives for our build, we had about 1 hour remaining to push towards our stretch goal: lyrics validation using Genius Lyrics running in Hashbrown's JS runtime.

To accomplish our stretch goal, we exposed two functions to the JS runtime:

1. `getLyrics(title, artist)`: fetches lyrics from Genius (via a local endpoint)
2. `getCompletion(system, input)`: a tiny, on‑demand LLM call in the VM to judge validity

<hb-code-example header="song-picker-view.ts">

```ts
@Component({
  selector: 'spot-song-picker-view',
  template: ` <!-- code omitted for brevity --> `,
})
export class SongPickerViewComponent {
  mcp = inject(McpServerService);
  query = signal('');
  textarea = viewChild.required<CdkTextareaAutosize>('autosize');
  constraint = input.required<string>();
  currentPlayer = input.required<string>();

  // 1. Create a new runtime instance that returns a `RuntimeRef`
  runtime = createRuntime({
    timeout: 20_000,

    // 2. Expose the `getCompletion` and `getLyrics` functions to the sandbox env
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
            apiUrl: 'http://localhost:5150/chat',
            model: 'gpt-4.1-mini',
            debugName: 'inception completion',
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
            `http://localhost:5150/lyrics?searchTerm=${`${title} by ${artist}`}`,
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

  // 3. Create the song picker agent
  songPickerUi = uiChatResource({
    model: 'gpt-4.1',

    // 4. The debug name enables the use of the Redux devtools
    debugName: 'Song Picker',

    // 5. Set the tone and provide the instruction to the model
    system: `
      You are a song picker for a Spotify playlist game.
      You are given a constraint and you need to help the user
      pick a song that matches the constraint. It is your job to
      validate the song and make sure it matches the constraint.
      If the song does not match the constraint, you should ask the
      user to pick a different song.

      Each message will contain the user's query, and the active
      constraint. You should use tools to query songs from Spotify.

      You must show the <spot-song> component to the user if there
      are valid songs to pick from, otherwise the user cannot
      select a song.

      Sometimes the user will ask who is playing or whose turn it is.
      If the user asks this, still search for songs, but also answer
      the question.

      Tool JavaScript is available to you. You can use it to ground 
      your answers. Additionally, some games may require that you 
      leverage AI to determine if a song selection is valid. For
      example, if the game is to select songs that mention food, you 
      can use the "getLyrics" function in the VM to get the lyrics of 
      the song and then use the "getCompletion" function to determine 
      if the song mentions food.

      Important: Verify the song exists in Spotify before using the
      "getLyrics" function. 

      Example Script (must be valid JavaScript):
      
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

    // 6. Expose Angular components to the model
    components: [
      exposeComponent(MarkdownComponent, {
        description: `
          Shows markdown to the user.
        `,
        input: {
          data: s.streaming.string('The markdown data to render.') as any,
        },
      }),
      exposeComponent(SongComponent, {
        description: `
        A song that can be picked from the playlist.
        `,
        input: {
          name: s.string('The name of the song.'),
          artist: s.string('The artist of the song.'),
          uri: s.string('The URI of the song.'),
        },
      }),
    ],

    // 7. Concat the remote MCP tools with tool JavaScript, providing the `RuntimeRef`
    tools: [
      ...this.mcp.tools().filter((tool) => tool.name === 'search'),
      createToolJavaScript({
        runtime: this.runtime,
      }),
    ],
  });

  // code omitted for brevity
}
```

</hb-code-example>

Let's review the code.

- We create a new JS runtime instance using `createRuntime`, exposing the `getCompletion` and `getLyrics` functions to the sandbox environment.
- We create a new `uiChatResource` for the song picker agent, setting a `system` prompt that defines the role of the agent and its responsibilities during song selection.
- We expose two Angular components: `MarkdownComponent` for displaying messages and `SongComponent` for displaying selectable songs.
- We concatenate the remote MCP `search` tool with a `createToolJavaScript` that provides the runtime instance to the model.

---

## Why Multiple Agents?

Following the patterns (like atomic design) that we are already familiar with, we split the responsibilities of the model into 3 "agents" or "chats".

1. The game setup agent/chat: required structured state collection
2. The game loop agent/chat: game orchestrations, tracking game progress, and rules verification
3. The song picker agent/chat: rules enforcement and lyrics validation

Each of the agents has distinct:

- System instructions
- State
- Lifecycle

We think it's really important to bring the architectural patterns and knowledge from existing systems into building web apps that use large language models.

After all, as Jason shares on the show, the models are non-deterministic "prediction machines".

Finally, having multiple agents enabled our small team of 2 to split up the tasks of building and testing each agent independently.

---

## The Demo

Who wants to go first?

We were both really excited to show what we were able to build and how Hashbrown had helped us build a pretty cool Spotify game in a few hours.

Here is what we shipped:

- Generative UI with real Angular components
- Streaming chat that drives the app without a router (yep, no router)
- Tool calling that grounds the model and provides access to the remote MCP server
- Model generated JavaScript code for lyrics validation that executes in the client in Hashbrown's JS runtime

> The best part of the demo was watching the other devs light up. It's part of the reason why we are building Hashbrown - it just needs to exist.

---

## Thanks

If you've got ideas for building with LLMs in your web app, clone the repo and try it out. We can't wait to see what you build!

A big thank you to the [Code TV](https://www.youtube.com/@codetv-dev) team.
Our experience of being on the web dev challenge show was incredible - something I will never forget.
