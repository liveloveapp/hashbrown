import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AddLightForm } from '../lights/add-light-form';
import { AddSceneForm } from '../scenes/add-scene-form';

@Component({
  selector: 'app-fab-speed-dial',
  imports: [MatButtonModule, MatIconModule, OverlayModule, MatDialogModule],
  template: `
    <button
      mat-fab
      color="primary"
      cdkOverlayOrigin
      aria-label="Open speed dial"
      (click)="openSpeedDial()"
      #button="cdkOverlayOrigin"
    >
      <mat-icon>{{ isOpen() ? 'close' : 'add' }}</mat-icon>
    </button>

    <ng-template
      cdk-connected-overlay
      [cdkConnectedOverlayOrigin]="button"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayPositions]="speedDialPositions"
      [cdkConnectedOverlayHasBackdrop]="true"
      (backdropClick)="closeSpeedDial()"
    >
      <div class="fab-actions">
        <button mat-fab extended (click)="addLight()">
          <mat-icon>lightbulb</mat-icon>
          Add Light
        </button>
        <button mat-fab extended id="add-scene-button" (click)="addScene()">
          <mat-icon>theaters</mat-icon>
          Add Scene
        </button>
      </div>
    </ng-template>
  `,
  styles: `
    .fab-actions {
      display: flex;
      align-items: flex-end;
      flex-direction: column;
      gap: 8px;
    }
  `,
})
export class FabSpeedDial {
  protected dialog = inject(MatDialog);
  protected isOpen = signal(false);

  protected speedDialPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -8,
    },
  ];

  protected openSpeedDial() {
    this.isOpen.set(true);
  }

  protected closeSpeedDial() {
    this.isOpen.set(false);
  }

  protected addLight() {
    this.dialog.open(AddLightForm);
    this.closeSpeedDial();
  }

  protected addScene() {
    this.dialog.open(AddSceneForm);
    this.closeSpeedDial();
  }
}
