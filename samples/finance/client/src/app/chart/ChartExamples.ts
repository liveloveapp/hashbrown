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
            <mat-icon>finance_mode</mat-icon>
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
    prompt: 'How many days of cover do we have left for eggs?',
    expectedChartType: 'line',
  },
  {
    prompt: 'Show our current inventory levels for the top ten ingredients.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Which ingredients are below safety stock right now?',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Plot the daily on-hand inventory of coffee beans for the last 60 days.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Rank every ingredient by percent of safety stock remaining.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Highlight items whose inventory fell under reorder point this week.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Which five ingredients had the largest inventory swings this quarter?',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Compare today’s inventory of hash browns to the 5-year average for this date.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Show the days-of-cover trend for butter over the past year.',
    expectedChartType: 'line',
  },
  {
    prompt: 'For each category, chart total on-hand stock vs safety stock.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt:
      'List all items projected to breach safety stock in the next seven days.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Which ingredients have triggered a reorder most often this year?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Plot the historical frequency of stockouts by ingredient.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'What was the average reorder point coverage for bacon strips last month?',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Identify ingredients that hit zero inventory at any point in the last 12 months.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'How long did each stockout event last for maple syrup over five years?',
    expectedChartType: 'line',
  },
  {
    prompt: 'Which category has the highest probability of stockout next week?',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Show the lead-time buffer (inventory - safety stock) for every ingredient today.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Chart how quickly we recover inventory after a reorder for shredded potatoes.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Which items breached reorder point but were not delivered within lead time?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Plot daily waffle-batter usage for the last 90 days.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Which three items showed the fastest month-over-month consumption growth?',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Show the 7-day moving average consumption of orange juice (cartons).',
    expectedChartType: 'line',
  },
  {
    prompt: 'Compare weekday vs weekend consumption of whole milk.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt:
      'Highlight ingredients with steady linear growth in demand over five years.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Which five items had the largest consumption spike on any single day?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Plot the cumulative consumption of butter year-to-date.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Break down total consumption by ingredient category for Q2.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Show the seasonality curve for bacon consumption over five years.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Which ingredients see consumption dip below their historical average each January?',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Rank ingredients by the variability of daily usage (standard deviation).',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Display the correlation matrix between daily consumptions of eggs, bacon, and bread.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt:
      'For maple syrup, chart average consumption per month across the last five years.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Which ingredients see their highest price peaks in March and April?',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Show consumption compared to the 5-year seasonal baseline for coffee beans this December.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Plot peak-month multipliers versus base consumption for every ingredient.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Which items have the largest gap between peak and trough demand?',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Heat-map the month-by-month consumption of all Food category items.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Does wastage rate increase during peak months for strawberries?',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Compare holiday-season demand (Nov–Jan) vs off-season demand for sausage links.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Which category shows the most pronounced summer spike?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Chart the year-over-year change in July demand for paper napkins.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Trend the unit price of coffee beans vs milk over the last year.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Which ingredients had the largest price volatility in the past six months?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Plot rolling average price of cooking oil with a 30-day window.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Show the correlation between unit cost and delivered quantity for eggs.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Rank ingredients by total spend year-to-date.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Which items exceeded their price peak multiplier this quarter?',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Highlight any ingredient with a sustained price increase >15 % over 60 days.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Plot cost per consumption unit for bacon strips over five years.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Break down monthly purchasing cost by category.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Compare the average price in peak vs non-peak months for cooking oil.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Show the cumulative purchasing spend since project start.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Which three items have the highest unit cost but lowest consumption?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Trend price vs wastage cost for butter to spot inefficiencies.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Display a price heat-map across ingredients and months.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Identify ingredients with price spikes aligned with delivery delays.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'What percentage of bacon deliveries ended up as waste each month?',
    expectedChartType: 'line',
  },
  {
    prompt: 'Chart the daily wastage rate for eggs this year.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Highlight ingredients whose waste exceeds 3 % of usage.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Rank items by total wastage cost year-to-date.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Plot waste as a share of inventory for perishable items vs non-perishable.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt:
      'Show the trend of wastage percent vs unit price for shredded potatoes.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Which ingredients have seen a downward trend in spoilage after Q1?',
    expectedChartType: 'line',
  },
  {
    prompt: 'Compare wastage rates before and after delivery days.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Display a scatter of consumption vs waste to spot outliers.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Which category contributes the highest absolute wastage value?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Plot rolling 30-day wastage totals for all ingredients.',
    expectedChartType: 'line',
  },
  {
    prompt: 'How often does wastage push inventory below safety stock?',
    expectedChartType: 'line',
  },
  {
    prompt: 'Chart the delivered quantity vs date for coffee beans.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Which ingredients have longest average lead times?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Display time between reorder trigger and delivery for eggs.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Plot the frequency of deliveries by ingredient category.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Trend delivered volumes against consumption for whole milk.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Which items experience delivery gaps exceeding lead-time SLA?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Show the distribution of delivery sizes for butter.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Compare actual vs expected lead time for each ingredient.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Highlight weeks with zero deliveries but high consumption.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Plot rolling 90-day delivery reliability (on-time rate).',
    expectedChartType: 'line',
  },
  {
    prompt: 'Which items will breach safety stock in seven days?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'How many purchase orders are needed this week?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Show the reorder events for shredded potatoes in the last year.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Rank ingredients by average reorder quantity.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Plot days between reorders for waffle-batter mix.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Which items repeatedly hit reorder point during peak season?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Display inventory at reorder vs delivery size to verify policy.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Which ingredient had the highest number of emergency reorders?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Show the time series of reorder point breaches across all items.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Trend average inventory at time of reorder for each category.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Summarize total consumption by category for the last quarter.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Compare average unit price across categories.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Show the inventory-to-waste ratio for Cleaning vs Packaging supplies.',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Plot total delivered volume for Beverage ingredients year-to-date.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Which category contributes the largest share of purchasing spend?',
    expectedChartType: 'pie',
  },
  {
    prompt:
      'Compare the consumption trend of butter, bacon, and bread on one chart.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Which five ingredients have the strongest consumption correlation with eggs?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Plot unit cost vs wastage rate scatter for all items.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Display inventory turnover for every ingredient side by side.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Rank items by consumption per dollar spent.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Highlight the top cost drivers versus their wastage cost.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Show average days of cover for the ten lowest-cost ingredients.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Compare year-over-year consumption growth across all beverages.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Which items have both high variability in price and consumption?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Plot peak-month multiplier vs safety stock for each ingredient.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt:
      'Estimate the gross-profit impact if egg prices rise 10 % next month.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'What happens to annual purchasing spend if bacon usage grows 5 %?',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt:
      'Simulate a 15 % reduction in wastage across all items—show savings.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt:
      'If lead times double, how many items will stock out within two weeks?',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Model the cost impact of switching to organic coffee beans at +$2/lb.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt:
      'Forecast cash tied up in inventory if safety stock is cut by 20 %.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Show the ROI of bulk buying waffle-batter mix for a 5 % discount.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt:
      'Calculate the cost per meal served given current consumption patterns.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt:
      'Provide a week-over-week summary of key metrics for all ingredients.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Which items had the largest drop in inventory last week?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Rank ingredients by total spend in Q1.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Show a monthly dashboard of consumption, cost, and wastage.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Highlight the top five rising prices this month vs last month.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Plot the year-to-date cumulative waste against last year’s.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Which items saw no deliveries during April?',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Display the rolling 12-month average cost for each ingredient.',
    expectedChartType: 'line',
  },
  {
    prompt:
      'Chart the inventory turnover ratio for perishable vs shelf-stable items.',
    expectedChartType: 'bar',
  },
  {
    prompt: 'Which ingredients have the highest cost-to-waste efficiency?',
    expectedChartType: 'bar',
  },
  {
    prompt:
      'Plot delivery service level (on-time rate) over the last 18 months.',
    expectedChartType: 'line',
  },
  {
    prompt: 'Show consumption per guest served for milk.',
    expectedChartType: 'bar-and-line',
  },
  {
    prompt: 'Display a dashboard of KPI trends: days of cover, wastage, spend.',
    expectedChartType: 'bar-and-line',
  },
];

function getFourRandomExamples(examples: ChartPrompt[]) {
  return examples.sort(() => Math.random() - 0.5).slice(0, 4);
}
