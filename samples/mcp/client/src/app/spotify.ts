import { Injectable, signal } from '@angular/core';
import { AccessToken, SpotifyApi } from '@spotify/web-api-ts-sdk';

@Injectable({ providedIn: 'root' })
export class SpotifyService {
  accessToken = signal<AccessToken | null>(null);

  constructor() {
    SpotifyApi.performUserAuthorization(
      'e431464735eb47aa9d622719c8170d0f',
      'http://127.0.0.1:3400/callback',
      [
        'user-read-currently-playing',
        'user-read-playback-state',
        'user-read-currently-playing',
        'app-remote-control',
        'streaming',
        'playlist-read-private',
        'playlist-read-collaborative',
        'playlist-modify-private',
        'playlist-modify-public',
      ],
      async () => {
        console.log('Authenticated with Spotify');
      },
    ).then((response) => {
      console.log(response);
      this.accessToken.set(response.accessToken);
    });
  }
}
