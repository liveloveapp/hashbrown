import { Component, inject, input } from '@angular/core';
import { ChatService } from '../services/chat';

@Component({
  selector: 'spot-song',
  template: `
    <div (click)="onSelect()" (keydown.enter)="onSelect()" tabindex="0">
      <h1>{{ name() }}</h1>
      <p>{{ artist() }}</p>
    </div>
  `,
})
export class SongComponent {
  chat = inject(ChatService);
  name = input.required<string>();
  artist = input.required<string>();
  uri = input.required<string>();

  onSelect() {
    this.chat.sendMessage(
      `select_song: ${JSON.stringify({
        name: this.name(),
        artist: this.artist(),
        uri: this.uri(),
      })}`,
    );
  }
}
