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
import { LightComponent } from './light.component';
import { LightListComponent } from './light-list.component';

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
    LightComponent,
    LightListComponent,
  ],
  template: `
    <div class="lights-container">
      <app-light-list title="Lights" icon="living">
        @for (light of lights(); track light.id) {
          <app-light [lightId]="light.id" icon="lightbulb" />
        }
      </app-light-list>
      <button mat-raised-button color="primary" [routerLink]="['/lights/add']">
        Add Light
      </button>
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
