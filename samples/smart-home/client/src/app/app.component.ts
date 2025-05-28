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
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
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
      <button mat-button (click)="toggleChatPanel()">
        <mat-icon>chat</mat-icon> Chat
      </button>
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
        padding: 84px 20px;
        max-width: 1200px;
        margin: 0 auto;
      }

      mat-toolbar {
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        position: fixed;
        z-index: 100;
      }

      .chatPanelOpen {
        margin-right: 40%;
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

  constructor(iconRegistry: MatIconRegistry) {
    iconRegistry.setDefaultFontSetClass('material-symbols-outlined');
  }

  toggleChatPanel() {
    this.store.dispatch(ChatActions.toggleChatPanel());
  }
}
