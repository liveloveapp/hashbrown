import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { SmartHome } from '../smart-home';

@Component({
  selector: 'app-light-card',
  imports: [MatCardModule, MatSliderModule, MatButtonModule, MatIconModule],
  template: `
    <div class="light-icon">
      <button
        mat-icon-button
        (click)="onToggle()"
        [class.on]="light().brightness > 0"
      >
        <mat-icon>lightbulb</mat-icon>
      </button>
    </div>

    <div class="light-name">{{ light().name }}</div>

    <div class="light-slider">
      <mat-slider min="0" max="100" step="1">
        <input
          matSliderThumb
          [value]="light().brightness"
          (valueChange)="onBrightnessChange($event)"
        />
      </mat-slider>
    </div>
  `,
  styles: [
    `
      :host {
        display: grid;
        width: 100%;
        grid-template-columns: 32px 1fr;
        grid-template-rows: auto auto;
        grid-template-areas:
          'icon name'
          'icon slider';
        column-gap: 16px;
        padding: 8px 16px;
      }

      .light-icon {
        grid-area: icon;
        font-size: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .light-icon .on {
        color: var(--mat-sys-primary);
      }

      .light-name {
        font-size: 13px;
        grid-area: name;
        padding-left: 8px;
      }

      .light-slider {
        grid-area: slider;
        padding-right: 16px;
      }

      mat-slider {
        width: 100%;
      }
    `,
  ],
})
export class LightCard {
  readonly smartHome = inject(SmartHome);
  readonly lightId = input.required<string>();
  readonly light = this.smartHome.light(this.lightId);

  onBrightnessChange(newValue: number) {
    this.smartHome.controlLight(this.lightId(), newValue);
  }

  onToggle() {
    this.smartHome.controlLight(
      this.lightId(),
      this.light().brightness > 0 ? 0 : 100,
    );
  }
}
