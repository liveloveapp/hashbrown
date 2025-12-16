import { useMemo } from 'react';
import clsx from 'clsx';
import styles from './ChartExamples.module.css';

export type ChartPromptType = 'line' | 'bar' | 'pie' | 'bar-and-line';

export interface ChartPrompt {
  prompt: string;
  expectedChartType: ChartPromptType;
}

interface ChartExamplesProps {
  onSelect: (prompt: ChartPrompt) => void;
}

const iconByType: Record<ChartPromptType, string> = {
  line: 'trending_up',
  bar: 'bar_chart',
  pie: 'pie_chart',
  'bar-and-line': 'fastfood',
};

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

const chooseExamples = (examples: ChartPrompt[]) => {
  const shuffled = [...examples];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 4);
};

export const ChartExamples = ({ onSelect }: ChartExamplesProps) => {
  const examples = useMemo(() => chooseExamples(chartPrompts), []);

  return (
    <div className={styles.root}>
      {examples.map((example) => (
        <button
          key={example.prompt}
          type="button"
          className={styles.button}
          onClick={() => onSelect(example)}
        >
          <span className={clsx('material-symbols-outlined', styles.icon)}>
            {iconByType[example.expectedChartType]}
          </span>
          <span>{example.prompt}</span>
        </button>
      ))}
    </div>
  );
};
