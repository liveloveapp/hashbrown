import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { SmartHome } from '../smart-home';
import { Squircle } from '../squircle';

@Component({
  selector: 'app-light-card',
  imports: [
    MatCardModule,
    MatSliderModule,
    MatButtonModule,
    MatIconModule,
    Squircle,
  ],
  template: `
    <div
      class="card"
      appSquircle="16"
      [appSquircleBorderWidth]="2"
      appSquircleBorderColor="var(--sunshine-yellow-light, #fde4ba)"
    >
      <div class="card-title">
        <button
          (click)="onToggle()"
          [class.on]="light().brightness > 0"
          appSquircle="4"
        >
          <mat-icon>lightbulb</mat-icon>
        </button>
        <p>{{ light().name }}</p>
      </div>
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
        display: block;
      }

      .card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
        background: #fff;

        > .card-title {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 8px;

          > button {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 24px;
            width: 24px;

            &.on {
              background: var(--sunshine-yellow-light, #fde4ba);
            }

            mat-icon {
              font-size: 14px;
              width: 14px;
              height: 14px;
            }
          }

          > p {
            margin: 0;
            color: var(--chocolate-brown, #774625);
            font:
              500 12px / 12px Fredoka,
              sans-serif;
          }
        }
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
