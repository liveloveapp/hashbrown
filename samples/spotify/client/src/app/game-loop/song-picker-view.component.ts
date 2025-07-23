/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  afterNextRender,
  Component,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  createToolJavaScript,
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { SongComponent } from './song';
import { fryHashbrown, s } from '@hashbrownai/core';
import { createRuntime, createRuntimeFunction } from '@hashbrownai/angular';
import { McpServerService } from '../services/mcp-server';
import { FormsModule } from '@angular/forms';
import { MarkdownComponent } from 'ngx-markdown';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';

@Component({
  imports: [RenderMessageComponent, FormsModule, CdkTextareaAutosize],
  selector: 'spot-song-picker-view',
  template: `
    <form (ngSubmit)="onSubmit($event)">
      <textarea
        name="query"
        placeholder="Search for a song or ask for suggestions"
        [ngModel]="query()"
        (ngModelChange)="query.set($event)"
        (keydown.enter)="onSubmitViaKeyboard($event)"
        rows="1"
        matInput
        cdkTextareaAutosize
        #textarea
        #autosize="cdkTextareaAutosize"
        cdkAutosizeMinRows="1"
        cdkAutosizeMaxRows="5"
      ></textarea>
      <button type="submit" (click)="onSubmit($event)">
        <span class="material-symbols-outlined"> search </span>
      </button>
    </form>

    @let message = songPickerUi.lastAssistantMessage();

    @if (message) {
      <hb-render-message [message]="message" class="generated-ui" />
    }
  `,
  styles: `
    form {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 32px;
      background-color: white;
      padding: 24px 0 24px 24px;
    }

    textarea {
      width: 100%;
      border: none;
      outline: none;
    }

    button {
      background-color: transparent;
      border: none;
      outline: none;
      cursor: pointer;
      padding: 0;
      margin: 0;
      display: flex;
    }

    .generated-ui {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  `,
})
export class SongPickerViewComponent {
  mcp = inject(McpServerService);
  query = signal('');
  textarea = viewChild.required<CdkTextareaAutosize>('autosize');
  constraint = input.required<string>();

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

  songPickerUi = uiChatResource({
    model: 'gpt-4.1',
    debugName: 'Song Picker',
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

      Tool JavaScript is available to you. You can use it to ground your answers. Additionally,
      some games may require that you leverage AI to determine if a song selection is valid. For
      example, if the game is to select songs that mention food, you can use the "getLyrics"
      function in the VM to get the lyrics of the song and then use the "getCompletion" function
      to determine if the song mentions food.

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
    tools: [
      ...this.mcp.tools().filter((tool) => tool.name === 'search'),
      createToolJavaScript({
        runtime: this.runtime,
      }),
    ],
  });

  constructor() {
    afterNextRender(() => {
      this.textarea().resizeToFitContent(true);
    });
  }

  onSubmitViaKeyboard($event: Event) {
    const keyboardEvent = $event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
      this.onSubmit($event);
    }
  }

  onSubmit($event: Event) {
    $event.preventDefault();

    if (this.query()) {
      this.songPickerUi.sendMessage({
        role: 'user',
        content: {
          query: this.query(),
          constraint: this.constraint(),
        },
      });
    }
  }
}
