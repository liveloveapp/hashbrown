import { Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Store } from '@ngrx/store';
import { selectLightEntities } from '../../../store';
import { ChatAiActions } from '../../chat/actions';
import { s } from '@hashbrownai/core';

export const LightIconSchema = s.enumeration(
  `Icon for the light. Default to "lightbulb".`,
  ['floor_lamp', 'table_lamp', 'wall_lamp', 'lightbulb'],
);

@Component({
  selector: 'app-light-card-button',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <button (click)="onToggle()" type="button">
      <mat-icon inline="true">{{ icon() }}</mat-icon>
      <div class="light-info">
        <span class="name">{{ shortenedName() }}</span>
        @if (light().brightness === 0) {
          <span class="brightness">Off</span>
        } @else if (light().brightness === 100) {
          <span class="brightness">On</span>
        } @else {
          <span class="brightness">{{ light().brightness }}%</span>
        }
      </div>
    </button>
  `,
  host: {
    '[class.on]': 'light().brightness > 0',
    '[class.off]': 'light().brightness === 0',
  },
  styles: `
    button {
      display: grid;
      grid-template-columns: 24px 112px;
      gap: 8px;
      align-items: center;
      width: 160px;
      height: 48px;
      cursor: pointer;
      transition: 0.5s;
      background-size: 200% auto;
      border: none;
      border-radius: 16px;
      font-size: 11px;
      font-weight: 500;
      padding: 8px;

      &:hover {
        background-position: right center;
      }
    }

    :host mat-icon {
      width: 24px;
      height: 24px;
      font-size: 16px;
      line-height: 24px;
      background-color: rgba(255, 255, 255, 0.56);
      border-radius: 24px;
    }

    .light-info {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: flex-start;
      max-width: 100%;
    }

    .light-info .name {
      font-weight: bold;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .light-info .brightness {
      opacity: 0.64;
    }

    :host(.off) button {
      color: rgba(255, 255, 255, 0.56);
    }

    :host(.off) mat-icon {
      background-color: rgba(0, 0, 0, 0.56);
    }

    :host(.off) button {
      background-image: linear-gradient(
        to right,
        #485563 0%,
        #29323c 51%,
        #485563 100%
      );
    }

    :host(.on) button {
      background-image: linear-gradient(
        to right,
        #ece9e6 0%,
        #ffffff 51%,
        #ece9e6 100%
      );
    }
  `,
})
export class LightCardButtonComponent {
  icon = input.required<s.Infer<typeof LightIconSchema>>();
  lightId = input.required<string>();
  shortenedName = input.required<string>();
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
