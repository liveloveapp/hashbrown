import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { PredictionsComponent } from './shared/predictions.component';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    PredictionsComponent,
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
    </mat-toolbar>

    <main>
      <router-outlet></router-outlet>
    </main>

    <app-predictions></app-predictions>
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
      .active {
        background: rgba(255, 255, 255, 0.1);
      }
    `,
  ],
})
export class AppComponent {}
