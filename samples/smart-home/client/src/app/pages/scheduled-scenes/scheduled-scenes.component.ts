import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SmartHomeService } from '../../services/smart-home.service';
import { ScheduledScene, Weekday } from '../../models/scheduled-scene.model';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ScheduleSceneFormDialogComponent } from './schedule-scene-form-dialog/schedule-scene-form-dialog.component';
import { Store } from '@ngrx/store';
import { ScheduledScenesPageActions } from './actions';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-scheduled-scenes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <div class="scheduled-scenes-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Scheduled Scenes</mat-card-title>
          <button
            mat-raised-button
            color="primary"
            (click)="openScheduledSceneDialog()"
          >
            Add Scheduled Scene
          </button>
        </mat-card-header>
        <mat-card-content>
          @for (scheduledScene of scheduledScenes(); track scheduledScene.id) {
            <div class="scheduled-scene-item">
              <div class="title-block">
                <h3 style="padding-bottom: 8px">{{ scheduledScene.name }}</h3>
                <h3 class="">
                  Scene: {{ getSceneName(scheduledScene.sceneId) }}
                </h3>

                <p>Starts: {{ scheduledScene.startDate | date: 'medium' }}</p>

                <p class="">
                  Repeats on:
                  {{ buildDayString(scheduledScene.weekdays) }}
                </p>
              </div>

              <div class="scheduled-scene-actions">
                <button mat-button (click)="toggleEnabled(scheduledScene)">
                  {{ scheduledScene.isEnabled ? 'Enabled' : 'Disabled' }}
                </button>
                <button
                  mat-icon-button
                  (click)="openScheduledSceneDialog(scheduledScene)"
                >
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  mat-icon-button
                  color="warn"
                  (click)="deleteScheduledScene(scheduledScene)"
                >
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
      .scheduled-scenes-container {
        padding: 20px;
      }

      .scheduled-scene-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 16px 0;
      }

      .scheduled-scene-actions {
        display: flex;
        gap: 8px;
      }

      .title-block {
        // width: 30%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-content: space-between;
        height: 100%;
      }

      mat-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .toggle-button {
      }
    `,
  ],
})
export class ScheduledScenesComponent {
  private dialog = inject(MatDialog);
  private store = inject(Store);
  private smartHomeService = inject(SmartHomeService);

  readonly scenes = this.smartHomeService.scenes;
  readonly scheduledScenes = this.smartHomeService.scheduledScenes;

  constructor() {
    this.store.dispatch(ScheduledScenesPageActions.enter());
  }

  weekdays = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];

  buildDayString(weekdays: boolean[]) {
    const dayStrings: string[] = [];

    for (let i = 0; i < this.weekdays.length; i++) {
      if (weekdays[i]) {
        dayStrings.push(this.weekdays[i].toLocaleUpperCase());
      }
    }

    if (dayStrings.length === 0) {
      return 'None';
    }

    return dayStrings.join(', ');
  }

  protected openScheduledSceneDialog(scheduledScene?: ScheduledScene) {
    const dialogRef = this.dialog.open(ScheduleSceneFormDialogComponent, {
      width: '500px',
      data: scheduledScene,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result) return;

      if (scheduledScene) {
        this.store.dispatch(
          ScheduledScenesPageActions.updateScheduledScene({
            id: scheduledScene.id,
            scheduledScene: result,
          }),
        );
      } else {
        this.store.dispatch(
          ScheduledScenesPageActions.addScheduledScene({
            scheduledScene: result,
          }),
        );
      }
    });
  }

  toggleEnabled(scheduledScene: ScheduledScene) {
    this.smartHomeService.updateScheduledScene(scheduledScene.id, {
      isEnabled: !scheduledScene.isEnabled,
    });
  }

  deleteScheduledScene(scheduledScene: ScheduledScene) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Scheduled Scene',
        message: `Are you sure you want to delete ${scheduledScene.name}?`,
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.store.dispatch(
          ScheduledScenesPageActions.deleteScheduledScene({
            id: scheduledScene.id,
          }),
        );
      }
    });
  }

  getSceneName(sceneId: string): string {
    const scene = this.scenes().find((scene) => scene.id === sceneId);
    return scene?.name ?? 'Unknown Scene';
  }
}
