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
import { selectAllScenes, selectIsChatPanelOpen } from '../../store';
import { SceneComponent } from './scene.component';

@Component({
  selector: 'app-scenes',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    SceneComponent,
  ],
  template: `
    <div class="scenes-list">
      @for (scene of scenes(); track scene.id) {
        <app-scene
          [sceneId]="scene.id"
          (applyScene)="applyScene(scene.id)"
        ></app-scene>
      }
    </div>
    <button
      class="add-scene-button"
      [class.chat-panel-open]="isChatPanelOpen()"
      mat-fab
      extended
      color="primary"
      (click)="openSceneDialog()"
    >
      Add Scene
    </button>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        position: relative;
      }

      .add-scene-button {
        position: fixed;
        bottom: 20px;
        right: 20px;
      }

      .add-scene-button.chat-panel-open {
        right: calc(40% + 20px);
      }

      .scenes-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 16px;
        padding: 16px;
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class ScenesComponent {
  private dialog = inject(MatDialog);
  private store = inject(Store);

  scenes = this.store.selectSignal(selectAllScenes);
  isChatPanelOpen = this.store.selectSignal(selectIsChatPanelOpen);

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
          ScenesPageActions.updateScene({ id: scene.id, scene: result }),
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
