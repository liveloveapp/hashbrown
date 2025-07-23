import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../services/chat';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

@Component({
  imports: [FormsModule],
  selector: 'spot-games-rules-view',
  template: `
    <div>
      <h1>Games Rules</h1>
      <form>
        <textarea
          name="rules"
          [ngModel]="rulesDescription()"
          (ngModelChange)="rulesDescription.set($event)"
        ></textarea>
      </form>

      @let errorResult = error();
      @let rulesResult = rules();

      @if (errorResult) {
        <div class="error">{{ errorResult }}</div>
      }

      @if (rulesResult) {
        <div class="rules">{{ rulesResult }}</div>
        <button (click)="onConfirmRules(rulesResult)">Submit</button>
      }
    </div>
  `,
  styles: ``,
})
export class GamesRulesViewComponent {
  chat = inject(ChatService);
  rulesDescription = signal('');

  validation = structuredCompletionResource({
    model: 'gpt-4.1',
    input: this.rulesDescription,
    schema: s.object('Game Rules', {
      result: s.anyOf([
        s.object('Game Rules', {
          rules: s.string('The rules of the game'),
        }),
        s.object('Validation Error', {
          error: s.string('The error message'),
        }),
      ]),
    }),
    system: `
      You are a helpful assistant that verifies that the user has provided
      a valid game description. This app lets users describe a playlist music
      game, where each player gets to pick a song to add to the playlist.

      You need to verify that the user has provided a game description that is
      achievable within this app.

      # Rules
       - Get songs (title, artist, album) from Spotify. We don't have lyrics.
       - Add songs to a playlist


      If the game description requires mechanisms beyond those listed above, respond
      with a validation error. This error should be clear and friendly. I will show
      it to the user, who is non-technical.

      If the game description is valid, respond with a clear, terse description of the
      game.
    `,
  });

  rules = computed(() => {
    const result = this.validation.value();

    if (result?.result && 'rules' in result.result) {
      return result.result.rules;
    }

    return null;
  });

  error = computed(() => {
    const result = this.validation.value();
    if (result?.result && 'error' in result.result) {
      return result.result.error;
    }
    return null;
  });

  onConfirmRules(rules: string) {
    this.chat.sendMessage(`confirm_rules:\n${rules}`);
  }
}
