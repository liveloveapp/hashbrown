import { Component, inject, input, signal } from '@angular/core';
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

@Component({
  imports: [RenderMessageComponent, FormsModule],
  selector: 'spot-song-picker-view',
  template: `
    <form (ngSubmit)="onSubmit($event)">
      <input
        type="text"
        name="query"
        [ngModel]="query()"
        (ngModelChange)="query.set($event)"
      />
      <button type="submit" (click)="onSubmit($event)">Search</button>
    </form>

    @let message = songPickerUi.lastAssistantMessage();

    @if (message) {
      <hb-render-message [message]="message" />
    }
  `,
  styles: ``,
})
export class SongPickerViewComponent {
  mcp = inject(McpServerService);
  query = signal('');
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
