import { Component, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

interface ChartPrompt {
  prompt: string;
  expectedChartType: 'line' | 'bar' | 'pie' | 'bar-and-line';
}

@Component({
  selector: 'app-chart-examples',
  imports: [MatIconModule],
  template: `
    @for (example of examples; track example.prompt) {
      <button type="button" (click)="selectExample.emit(example)">
        @switch (example.expectedChartType) {
          @case ('line') {
            <mat-icon>trending_up</mat-icon>
          }
          @case ('bar') {
            <mat-icon>bar_chart</mat-icon>
          }
          @case ('pie') {
            <mat-icon>pie_chart</mat-icon>
          }
          @case ('bar-and-line') {
            <mat-icon>fastfood</mat-icon>
          }
        }
        <span>{{ example.prompt }}</span>
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    button {
      font-family: 'Fredoka';
      text-align: left;
      display: grid;
      grid-template-columns: 24px 1fr;
      align-items: center;
      gap: 8px;
      background-color: transparent;
      border: none;
      padding: 0;
      color: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      color: rgba(0, 0, 0, 0.32);
      transition: color 0.2s ease-in-out;
    }

    button mat-icon {
      opacity: 0.92;
      transition: opacity 0.2s ease-in-out;
    }

    button:hover {
      color: rgba(0, 0, 0, 0.8);
    }

    button:hover mat-icon {
      opacity: 1;
    }

    button:nth-child(4n) mat-icon {
      color: #9ecfd7;
    }

    button:nth-child(4n + 1) mat-icon {
      color: #b76060;
    }

    button:nth-child(4n + 2) mat-icon {
      color: #e88c4d;
    }

    button:nth-child(4n + 3) mat-icon {
      color: #fbbb52;
    }
  `,
})
export class ChartExamples {
  examples = getFourRandomExamples(chartPrompts);
  selectExample = output<ChartPrompt>();
}

const chartPrompts: ChartPrompt[] = [
  {
    prompt: 'Show the daily consumption of Eggs over the past 30 days.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Compare current inventory vs safety stock for all ingredients.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Top five ingredients by total consumption year-to-date.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Wastage percentage for each ingredient in the current month.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Trend of unit price for Coffee Beans over the past year.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Monthly delivered quantities for Bacon Strips over the last 12 months.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Average lead time (days) for each ingredient.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Current inventory levels for all Beverage category items.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Days of cover remaining for Whole Milk based on current consumption rate.',
    expectedChartType: 'line',
  },
  {
    prompt: 'List ingredients that are below their reorder point right now.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Month with highest average consumption of Shredded Potatoes (last five years).',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Compare price vs wastage cost for Butter over the past six months.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Delivered volume vs consumption for Orange Juice year-to-date.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Cumulative consumption of Waffle-Batter Mix this year.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Breakdown of current inventory by category.',
    expectedChartType: 'pie',
  },
  {
    prompt: 'Top three ingredients by price volatility in the last six months.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Safety stock and reorder point for Paper Napkins.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Waste trend for Strawberry Topping over the past three months.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Compare weekend vs weekday consumption of Whole Milk.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Inventory turnover ratio for each ingredient (annual).',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Correlation between daily consumption of Eggs and Bacon Strips.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Monthly spend per ingredient category (year-to-date).',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Forecast which ingredient will breach safety stock next.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Stockout days percentage for each ingredient last year.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Average daily wastage cost per ingredient.',
    expectedChartType: 'bar',
  },
];

function getFourRandomExamples(examples: ChartPrompt[]) {
  return examples.sort(() => Math.random() - 0.5).slice(0, 4);
}
