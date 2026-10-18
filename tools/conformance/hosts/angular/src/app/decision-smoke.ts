import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import {
  decisionResource,
  UiDecisionComponent,
  uiDecisionResource,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

const routeSchema = s.object('Route', {
  intent: s.enumeration('Intent', { filter: 'Filter', chat: 'Chat' }),
  clear: s.boolean('Clear'),
});

@Component({
  selector: 'runtime-weather-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div data-testid="candidate-weather">Weather card</div>`,
})
class WeatherCard {}

@Component({
  selector: 'runtime-stocks-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div data-testid="candidate-stocks">Stocks card</div>`,
})
class StocksCard {}

/** Angular decision fixture used by the shared decisions conformance suite. */
@Component({
  selector: 'runtime-decision-smoke',
  standalone: true,
  imports: [UiDecisionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <input
        data-testid="decision-input"
        [value]="text()"
        (input)="onInput($event)"
      />
      <div data-testid="decision-intent" [textContent]="intent()"></div>
      <div data-testid="decision-clear" [textContent]="clear()"></div>
      <div data-testid="decision-confidence" [textContent]="confidence()"></div>
      <div data-testid="decision-error" [textContent]="errorText()"></div>
      <div data-testid="candidate-ids" [textContent]="ids()"></div>
      <hb-ui-decision [resource]="picked" />
    </section>
  `,
})
export class DecisionSmoke {
  protected readonly text = signal('');
  private readonly input = computed(() =>
    this.text() === '' ? null : this.text(),
  );
  private readonly route = decisionResource({
    schema: routeSchema,
    input: this.input,
  });
  protected readonly picked = uiDecisionResource({
    input: this.input,
    select: 'one',
    candidates: [
      {
        id: 'weather',
        description: 'Weather questions',
        component: WeatherCard,
      },
      {
        id: 'stocks',
        description: 'Stock questions',
        component: StocksCard,
      },
    ],
  });
  protected readonly intent = computed(() => this.route.value()?.intent ?? '');
  protected readonly clear = computed(() => {
    const value = this.route.value();

    return value ? String(value.clear) : '';
  });
  protected readonly confidence = computed(() => {
    const meta = this.route.meta();

    return meta ? String(meta.intent.confidence) : '';
  });
  protected readonly errorText = computed(() => {
    const error = this.route.error();

    return error instanceof Error
      ? error.message
      : error === undefined
        ? ''
        : String(error);
  });
  protected readonly ids = computed(() =>
    this.picked.mode === 'candidates' ? this.picked.ids().join(',') : '',
  );

  protected onInput(event: Event): void {
    this.text.set((event.currentTarget as HTMLInputElement).value);
  }
}
