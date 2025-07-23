import { Component, effect, inject, input, signal } from '@angular/core';
import { ChatService } from '../services/chat';
import { SpotifyService } from '../services/spotify';

@Component({
  selector: 'spot-song',
  template: `
    <div
      class="song"
      (click)="onSelect()"
      (keydown.enter)="onSelect()"
      tabindex="0"
    >
      @let albumArtworkUrlResult = albumArtworkUrl();
      @if (albumArtworkUrlResult) {
        <img [src]="albumArtworkUrlResult" alt="Album artwork" />
      } @else {
        <div class="album-artwork-placeholder"></div>
      }
      <h3>{{ name() }}</h3>
      <p>{{ artist() }}</p>
    </div>
  `,
  styles: `
    .song {
      display: grid;
      grid-template-columns: 32px 1fr;
      grid-template-rows: 16px 16px;
      grid-template-areas:
        'album-artwork name'
        'album-artwork artist';
      column-gap: 12px;
      row-gap: 4px;

      img,
      .album-artwork-placeholder {
        grid-area: album-artwork;
        width: 32px;
        height: 32px;
        object-fit: cover;
      }

      .album-artwork-placeholder {
        background-color: #f0f0f0;
      }

      h3 {
        grid-area: name;
      }

      p {
        grid-area: artist;
        font-size: 12px;
        color: #666;
      }
    }
  `,
})
export class SongComponent {
  chat = inject(ChatService);
  spotify = inject(SpotifyService);
  name = input.required<string>();
  artist = input.required<string>();
  uri = input.required<string>();
  albumArtworkUrl = signal<string | null>(null);

  constructor() {
    effect(() => {
      const [, id] = this.uri().split('spotify:track:');
      if (id) {
        this.spotify.getSong(id).then((song) => {
          this.albumArtworkUrl.set(song.album.images[0].url);
        });
      }
    });
  }

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
