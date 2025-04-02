import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { Scene } from '../../models/scene.model';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { SceneFormDialogComponent } from './scene-form-dialog/scene-form-dialog.component';
import { ScenesPageActions } from './actions/scenes-page.actions';
import { selectAllScenes } from '../../store';

@Component({
  selector: 'app-scenes',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
  ],
  template: `
    <div class="scenes-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Scenes</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <button mat-raised-button color="primary" (click)="openSceneDialog()">
            Add Scene
          </button>

          @for (scene of scenes(); track scene.id) {
          <div class="scene-item">
            <h3>{{ scene.name }}</h3>
            <div class="scene-actions">
              <button
                mat-raised-button
                color="primary"
                (click)="applyScene(scene.id)"
              >
                Apply
              </button>
              <button mat-icon-button (click)="openSceneDialog(scene)">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="deleteScene(scene)">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .scenes-container {
        padding: 20px;
      }
      .scene-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 16px 0;
      }
      .scene-actions {
        display: flex;
        gap: 8px;
      }
    `,
  ],
})
export class ScenesComponent {
  private dialog = inject(MatDialog);
  private store = inject(Store);

  scenes = this.store.selectSignal(selectAllScenes);

  constructor() {
    this.store.dispatch(ScenesPageActions.enter());
  }

  protected openSceneDialog(scene?: Scene) {
    const dialogRef = this.dialog.open(SceneFormDialogComponent, {
      width: '500px',
      data: scene,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) return;

      if (scene) {
        this.store.dispatch(
          ScenesPageActions.updateScene({ id: scene.id, scene: result })
        );
      } else {
        this.store.dispatch(ScenesPageActions.addScene({ scene: result }));
      }
    });
  }

  protected deleteScene(scene: Scene) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Scene',
        message: `Are you sure you want to delete ${scene.name}?`,
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.store.dispatch(ScenesPageActions.deleteScene({ id: scene.id }));
      }
    });
  }

  protected applyScene(id: string) {
    this.store.dispatch(ScenesPageActions.applyScene({ id }));
  }
}
