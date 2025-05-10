import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSliderModule } from '@angular/material/slider';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { Light } from '../../models/light.model';
import { Store } from '@ngrx/store';
import { LightsPageActions } from './actions/lights-page.actions';
import { selectAllLights } from '../../store';

@Component({
  selector: 'app-lights',
  standalone: true,
  imports: [
    CommonModule,
    MatSliderModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    RouterLink,
  ],
  template: `
    <div class="lights-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Lights</mat-card-title>
          <button
            mat-raised-button
            color="primary"
            [routerLink]="['/lights/add']"
          >
            Add Light
          </button>
        </mat-card-header>
        <mat-card-content>
          @for (light of lights(); track light.id) {
            <div class="light-item">
              <h3>{{ light.name }}</h3>
              <div class="light-interactions">
                <mat-slider [min]="0" [max]="100" [step]="1">
                  <input
                    matSliderThumb
                    [value]="light.brightness"
                    (valueChange)="updateBrightness(light.id, $event)"
                  />
                </mat-slider>
                <div class="light-actions">
                  <button
                    mat-icon-button
                    [routerLink]="['/lights', light.id, 'edit']"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    color="warn"
                    (click)="deleteLight(light)"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </div>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .lights-container {
        padding: 20px;
      }
      .light-item {
        display: flex;
        align-items: center;
        gap: 16px;
        margin: 16px 0;
        justify-content: space-between;
      }
      .light-actions {
        display: flex;
        gap: 8px;
      }

      .light-interactions {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
      }

      h3 {
        min-width: 150px;
      }

      mat-slider {
        width: 100%;
      }

      mat-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
    `,
  ],
})
export class LightsComponent {
  private dialog = inject(MatDialog);
  private store = inject(Store);
  lights = this.store.selectSignal(selectAllLights);

  constructor() {
    this.store.dispatch(LightsPageActions.enter());
  }

  updateBrightness(id: string, brightness: number) {
    this.store.dispatch(
      LightsPageActions.updateLight({ id, changes: { brightness } }),
    );
  }

  deleteLight(light: Light) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Light',
        message: `Are you sure you want to delete ${light.name}?`,
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.store.dispatch(LightsPageActions.deleteLight({ id: light.id }));
      }
    });
  }
}
