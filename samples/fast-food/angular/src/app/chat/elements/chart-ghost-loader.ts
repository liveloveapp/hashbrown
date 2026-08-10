import {
  Component,
  effect,
  input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { JsonResolvedValue } from 'packages/core/src/skillet/parser/json-parser';

@Component({
  selector: 'app-chart-ghost-loader',
  template: ` <section class="chart-wrapper">Generating chart...</section> `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
      width: var(--max-article-width);
      margin: 16px auto 24px;
    }

    .chart-wrapper {
      position: relative;
      width: 100%;
      min-height: 320px;
      padding: 16px;
    }
  `,
})
export class ChartGhostLoader {
  partialProps = input.required<Record<string, JsonResolvedValue>>();
  constructor() {
    effect(() => {
      console.log('partialProps', this.partialProps());
    });
  }
}
