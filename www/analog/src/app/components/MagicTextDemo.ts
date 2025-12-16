import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSliderModule } from '@angular/material/slider';
import { MagicText, type MagicTextCitation } from '@hashbrownai/angular';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-magic-text-demo',
  imports: [CommonModule, MatSliderModule, MagicText, Squircle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <section
      class="www-magic-text-demo"
      wwwSquircle="16"
      [wwwSquircleBorderWidth]="2"
      wwwSquircleBorderColor="rgba(0, 0, 0, 0.06)"
    >
      <div
        class="preview"
        aria-label="Magic Text preview"
        wwwSquircle="10"
        [wwwSquircleBorderWidth]="2"
        wwwSquircleBorderColor="rgba(0, 0, 0, 0.08)"
      >
        <hb-magic-text
          class="magic"
          [text]="visibleMarkdown()"
          [citations]="citations"
        />
      </div>

      <div class="controls">
        <label for="magic-slider">
          Stream progress: <span>{{ percent() }}%</span>
        </label>
        <mat-slider id="magic-slider" [min]="0" [max]="100" [step]="1">
          <input
            matSliderThumb
            aria-label="Stream percentage"
            [value]="percent()"
            (input)="onPercentInput($event)"
            (valueChange)="onPercentChange($event)"
          />
        </mat-slider>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      color: inherit;
    }

    .www-magic-text-demo {
      display: grid;
      gap: 16px;
      padding: 16px;
      background: #ffffff;
    }

    .www-magic-text-demo .preview {
      height: 180px;
      overflow: hidden;
      padding: 16px;
      background: linear-gradient(180deg, #fbfbff 0%, #ffffff 80%);
      display: flex;
      align-items: center;
      font-size: 15px;
      line-height: 1.6;
    }

    .www-magic-text-demo .magic {
      width: 100%;
    }

    .www-magic-text-demo .controls {
      display: grid;
      gap: 4px;
      width: 80%;
      margin: 0 auto;
    }

    .www-magic-text-demo label {
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
      letter-spacing: 0.01em;
    }

    .www-magic-text-demo mat-slider {
      width: 100%;
    }

    .www-magic-text-demo .mdc-slider__track--active {
      background-color: var(--sunshine-yellow-light);
    }

    .www-magic-text-demo .mdc-slider__track--active_fill {
      border-color: var(--sunshine-yellow);
    }

    .www-magic-text-demo .mdc-slider__thumb-knob {
      background-color: var(--sunshine-yellow);
      border-color: var(--sunshine-yellow);
      border-radius: 16px;
    }

    .www-magic-text-demo .mdc-slider__thumb--focused .mdc-slider__thumb-knob {
      background-color: var(--sunshine-yellow-dark);
      border-color: var(--sunshine-yellow-dark);
    }
  `,
})
export class MagicTextDemo {
  readonly citations: MagicTextCitation[] = [
    {
      id: 'wiki',
      url: 'https://en.wikipedia.org/wiki/Waffle_House',
    },
    {
      id: 'wh',
      url: 'https://www.wafflehouse.com/pstories/waffle-house-hashbrowns/',
    },
    {
      id: 'gng',
      url: 'https://gardenandgun.com/articles/scattered-smothered-covered-chunked-too-today-in-southern-history',
    },
    {
      id: 'eater',
      url: 'https://www.eater.com/2017/5/2/15471798/waffle-house-history-menu',
    },
  ];

  readonly fullMarkdown = `
**Hashbrowns** at [Waffle House](https://www.wafflehouse.com) started as simple scattered potatoes when the first shop opened in 1955[^wiki]; the now-iconic "scattered, smothered & covered" shorthand hit menus in February 1984[^wh]. Grill crews kept riffing until the \`all-the-way\` call piled on every topping — cheese, ham, tomatoes, jalapeños, mushrooms, chili, *and* sausage gravy — a salty love letter to late-night diners[^gng]. Today cooks still sear the potatoes on the open griddle so cheese melts while onions stay *just* caramelized[^eater].`;

  readonly percent = signal(100);

  readonly visibleMarkdown = computed(() => {
    const clamped = Math.max(0, Math.min(100, this.percent()));
    const visibleWords = Math.max(
      0,
      Math.round((clamped / 100) * this.fullMarkdown.length),
    );
    return this.fullMarkdown.slice(0, visibleWords);
  });

  onPercentInput(event: Event) {
    const target = event.target as HTMLInputElement | null;
    const value = target?.valueAsNumber ?? Number(target?.value ?? NaN);
    if (!Number.isNaN(value)) {
      this.percent.set(Math.max(0, Math.min(100, value)));
    }
  }

  onPercentChange(value: number | null) {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      this.percent.set(value);
    }
  }
}
