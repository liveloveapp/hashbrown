import { Injectable, signal } from '@angular/core';
import { AccessToken, SpotifyApi } from '@spotify/web-api-ts-sdk';

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  accessToken = signal<AccessToken | null>(null);

  async login() {
    const scopes = [
      'user-read-currently-playing',
      'user-read-playback-state',
      'user-read-currently-playing',
      'app-remote-control',
      'streaming',
      'playlist-read-private',
      'playlist-read-collaborative',
      'playlist-modify-private',
      'playlist-modify-public',
    ];
    const redirectUri = 'http://127.0.0.1:5100';

    const auth = await SpotifyApi.performUserAuthorization(
      'e431464735eb47aa9d622719c8170d0f',
      redirectUri,
      scopes,
      async () => {
        console.log('Authenticated with Spotify!');
      },
    );

    this.accessToken.set(auth.accessToken);

    return { authenticated: true };
  }

  isAuthenticated() {
    return this.accessToken() !== null;
  }
}
