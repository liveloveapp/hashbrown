import { Component, inject } from '@angular/core';
import { SpotifyService } from '../services/spotify';
import { ChatService } from '../services/chat';

@Component({
  imports: [],
  selector: 'spot-login-view',
  template: ` <button (click)="login()">Login with Spotify</button> `,
  styles: ``,
})
export class LoginViewComponent {
  spotify = inject(SpotifyService);
  chat = inject(ChatService);

  login() {
    this.spotify.login().then(() => {
      console.log('logged in');
      this.chat.sendMessage('is_authenticated: true');
    });
  }
}
