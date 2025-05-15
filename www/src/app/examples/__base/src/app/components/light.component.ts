import { Component, computed, inject, input, output } from '@angular/core';
import { ChevronRight } from '../icons/chevron-right.component';
import { Light } from '../models/light';
import { LightsStore } from '../store/lights.store';
import { CardComponent } from './card.component';
import { SliderComponent } from './slider.component';

@Component({
  selector: 'app-light',
  imports: [CardComponent, ChevronRight, SliderComponent],
  template: `
    <app-card [title]="light().name">
      <div class="light">
        <div>
          <app-slider
            [value]="light().brightness"
            (change)="onBrightnessChange($event)"
          />
          {{ light().brightness }}%
        </div>
      </div>
      <app-chevron-right />
    </app-card>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .light {
        flex: 1 auto;
        display: flex;
        justify-content: space-between;
        gap: 16px;

        > div {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
        }
      }
    `,
  ],
})
export class LightComponent {
  lightStore = inject(LightsStore);
  lightId = input.required<string>();
  change = output<{ id: string; changes: Partial<Light> }>();

  light = computed(() => {
    return this.lightStore.entityMap()[this.lightId()];
  });

  onBrightnessChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const brightness = parseInt(target.value, 10);
    this.change.emit({ id: this.lightId(), changes: { brightness } });
  }
}
