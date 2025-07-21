import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { SpotifyService } from './spotify';

@Component({
  imports: [RouterModule],
  selector: 'app-root',
  template: `
    @if (spotifyService.accessToken()) {
      <router-outlet></router-outlet>
    } @else {
      <div>Not authenticated with Spotify</div>
    }
  `,
  styles: ``,
})
export class App {
  constructor(
    iconRegistry: MatIconRegistry,
    readonly spotifyService: SpotifyService,
  ) {
    iconRegistry.setDefaultFontSetClass('material-symbols-outlined');
  }
}
