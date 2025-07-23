import {
  afterNextRender,
  Component,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { SongComponent } from './song';
import { s } from '@hashbrownai/core';
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
      constraint. You should use the tools query songs from Spotify.

      You must show the <spot-song> component to the user if there
      are valid songs to pick from, otherwise the user cannot
      select a song.
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
    tools: [...this.mcp.tools().filter((tool) => tool.name === 'search')],
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
