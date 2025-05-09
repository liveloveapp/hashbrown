import { Component, computed, inject, input, output } from '@angular/core';
import { ChevronRight } from '../icons/ChevronRight';
import { Light as LightModel } from '../models/light.model';
import { LightsStore } from '../store/LightsStore';
import { Card } from './Card';
import { CardContent } from './CardContent';
import { Slider } from './Slider';

@Component({
  selector: 'www-light',
  imports: [ChevronRight, Card, CardContent, Slider],
  template: `
    <www-card>
      <www-card-content>
        <div>
          <p>{{ light().name }}</p>
          <div>
            <www-slider
              [value]="light().brightness"
              (change)="onBrightnessChange($event)"
            />
            {{ light().brightness }}%
          </div>
        </div>
        <www-chevron-right />
      </www-card-content>
    </www-card>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      www-card-content {
        flex-direction: row;
        padding: 16px;
        display: flex;
        justify-content: space-between;

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
export class Light {
  change = output<{ id: string; changes: Partial<LightModel> }>();
  lightStore = inject(LightsStore);
  lightId = input.required<string>();
  light = computed(() => {
    return this.lightStore.entityMap()[this.lightId()];
  });

  onBrightnessChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const brightness = parseInt(target.value, 10);
    this.change.emit({ id: this.lightId(), changes: { brightness } });
  }
}
