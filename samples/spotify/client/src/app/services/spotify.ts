import { Injectable, signal } from '@angular/core';
import { AccessToken, SpotifyApi } from '@spotify/web-api-ts-sdk';

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  private readonly clientId = 'e431464735eb47aa9d622719c8170d0f';
  private readonly redirectUri = 'http://127.0.0.1:5100';
  private readonly scopes = [
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
  accessToken = signal<AccessToken | null>(null);

  async login() {
    const auth = await SpotifyApi.performUserAuthorization(
      this.clientId,
      this.redirectUri,
      this.scopes,
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

  async getSong(uri: string) {
    const spotify = await SpotifyApi.withUserAuthorization(
      this.clientId,
      this.redirectUri,
      this.scopes,
    );

    return await spotify.tracks.get(uri);
  }
}
