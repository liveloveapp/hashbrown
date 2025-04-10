import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { Store } from '@ngrx/store';
import { PredictionsComponent } from './shared/predictions.component';
import { ChatActions } from './features/chat/actions';
import { selectIsChatPanelOpen } from './store';
import { ChatPanelComponent } from './features/chat/chat-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    PredictionsComponent,
    ChatPanelComponent,
  ],
  template: `
    <mat-toolbar color="primary">
      <span>Smart Home</span>
      <div class="spacer"></div>
      <button mat-button routerLink="/lights" routerLinkActive="active">
        Lights
      </button>
      <button mat-button routerLink="/scenes" routerLinkActive="active">
        Scenes
      </button>
      <button
        mat-button
        routerLink="/scheduled-scenes"
        routerLinkActive="active"
      >
        Scheduled Scenes
      </button>
      <button mat-button (click)="openChatPanel()">Chat</button>
    </mat-toolbar>

    <main [class.chatPanelOpen]="isChatPanelOpen()">
      <router-outlet></router-outlet>
    </main>

    <app-predictions></app-predictions>

    @if (isChatPanelOpen()) {
      <app-chat-panel></app-chat-panel>
    }
  `,
  styles: [
    `
      .spacer {
        flex: 1 1 auto;
      }

      main {
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
      }

      mat-toolbar {
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      }

      .chatPanelOpen {
        margin-right: 400px;
      }

      .active {
        background: rgba(255, 255, 255, 0.1);
      }
    `,
  ],
})
export class AppComponent {
  store = inject(Store);
  isChatPanelOpen = this.store.selectSignal(selectIsChatPanelOpen);

  openChatPanel() {
    this.store.dispatch(ChatActions.openChatPanel());
  }
}
