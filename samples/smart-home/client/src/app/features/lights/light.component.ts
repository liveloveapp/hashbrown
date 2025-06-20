import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { Store } from '@ngrx/store';
import { selectLightEntities } from '../../store';
import { ChatAiActions } from '../chat/actions';
import { s } from '@hashbrownai/core';

export const LightIconSchema = s.enumeration(
  `Icon for the light. Default to "lightbulb".`,
  ['floor_lamp', 'table_lamp', 'wall_lamp', 'lightbulb'],
);

@Component({
  selector: 'app-light',
  standalone: true,
  imports: [MatCardModule, MatSliderModule, MatButtonModule, MatIconModule],
  template: `
    <div class="light-icon">
      <button
        mat-icon-button
        (click)="onToggle()"
        [class.on]="light().brightness > 0"
      >
        <mat-icon>{{ icon() }}</mat-icon>
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
        color: #015cbb;
        background-color: rgba(1, 92, 187, 0.1);
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
export class LightComponent {
  icon = input<s.Infer<typeof LightIconSchema>>('lightbulb');
  lightId = input.required<string>();
  store = inject(Store);
  lightEntities = this.store.selectSignal(selectLightEntities);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  light = computed(() => this.lightEntities()[this.lightId()]!);
  brightnessChange = output<number>();

  onBrightnessChange(newValue: number) {
    this.store.dispatch(
      ChatAiActions.controlLight({
        lightId: this.lightId(),
        brightness: newValue,
      }),
    );
  }

  onToggle() {
    this.store.dispatch(
      ChatAiActions.controlLight({
        lightId: this.lightId(),
        brightness: this.light().brightness > 0 ? 0 : 100,
      }),
    );
  }
}
