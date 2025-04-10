import { Component, computed, inject, input, output } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatSliderModule } from '@angular/material/slider';
import { Store } from '@ngrx/store';
import { selectLightEntities } from '../../../store';

@Component({
  selector: 'app-light-card',
  standalone: true,
  imports: [MatCardModule, MatSliderModule],
  template: `
    @let light = maybeLight();
    @if (light) {
      <mat-card>
        <mat-card-header>
          <mat-card-subtitle>{{ light.name }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="light-card-content">
            <mat-slider min="0" max="100" step="1">
              <input
                matSliderThumb
                [value]="light.brightness"
                (valueChange)="onBrightnessChange($event)"
              />
            </mat-slider>
          </div>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      mat-card {
        width: 100%;
      }

      .light-card-content {
        width: 100%;
        padding-right: 16px;
      }

      mat-slider {
        width: 100%;
      }
    `,
  ],
})
export class LightCardComponent {
  lightId = input.required<string>();
  store = inject(Store);
  lightEntities = this.store.selectSignal(selectLightEntities);
  maybeLight = computed(() => this.lightEntities()[this.lightId()]);
  brightnessChange = output<number>();

  onBrightnessChange(newValue: number) {
    this.brightnessChange.emit(newValue);
  }
}
