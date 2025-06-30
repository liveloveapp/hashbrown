import { s } from '@hashbrownai/core';

const legendSchema = s.object('the legend for the chart', {
  display: s.boolean('whether to display the legend'),
  position: s.enumeration('the position of the legend', [
    'top',
    'bottom',
    'left',
    'right',
  ]),
  align: s.enumeration('alignment of the legend items', [
    'start',
    'center',
    'end',
  ]),
  labels: s.object('the labels configuration for the legend', {
    color: s.string('the color of the label text'),
    font: s.object('the font options for legend labels', {
      family: s.string('the font family'),
      size: s.number('the font size'),
      style: s.enumeration('the font style', [
        'normal',
        'italic',
        'oblique',
        'initial',
        'inherit',
      ]),
      weight: s.number('the font weight'),
      lineHeight: s.number('the line height for labels'),
    }),
  }),
  title: s.object('the title configuration for the chart', {
    display: s.boolean('whether to display the title'),
    text: s.string('the title text'),
    color: s.string('the color of the title'),
    font: s.object('the font options for the title', {
      family: s.string('the font family'),
      weight: s.number('the font weight'),
      size: s.number('the font size'),
      lineHeight: s.number('the line height for the title'),
    }),
  }),
});

const interactionSchema = s.object('the interaction for the chart', {
  mode: s.anyOf([
    s.enumeration('the mode of the interaction', [
      'index',
      'dataset',
      'point',
      'nearest',
      'x',
      'y',
    ]),
    s.nullish(),
  ]),
  axis: s.anyOf([
    s.enumeration('the axis of the interaction', ['x', 'y', 'xy']),
    s.nullish(),
  ]),
  intersect: s.boolean('whether to intersect the interaction'),
});

const optionsSchema = s.object('the options for the chart', {
  plugins: s.object('the plugins for the chart', {
    legend: legendSchema,
    title: s.object('the title configuration for the chart', {
      display: s.boolean('whether to display the title'),
      text: s.string('the title text'),
      position: s.enumeration('the position of the title', ['top', 'bottom']),
      color: s.string('the color of the title'),
      align: s.enumeration('alignment of the title', [
        'start',
        'center',
        'end',
      ]),
    }),
  }),
  scales: s.object('the scales for the chart', {
    x: s.object('the x-axis scale', {
      grid: s.object('the grid configuration for the x-axis', {
        color: s.string('the color of the grid'),
      }),
      ticks: s.object('the ticks configuration for the x-axis', {
        color: s.string('the color of the label text'),
        font: s.object('the font options for x-axis labels', {
          family: s.string('the font family'),
          size: s.number('the font size'),
        }),
      }),
    }),
    y: s.object('the y-axis scale', {
      grid: s.object('the grid configuration for the y-axis', {
        color: s.string('the color of the grid'),
      }),
      ticks: s.object('the ticks configuration for the y-axis', {
        color: s.string('the color of the label text'),
        font: s.object('the font options for y-axis labels', {
          family: s.string('the font family'),
          size: s.number('the font size'),
        }),
      }),
    }),
  }),
  interaction: interactionSchema,
});

const chartTypeSchema = s.anyOf([
  s.object('a line chart', {
    type: s.literal('line'),
    data: s.object('The data for a line chart', {
      labels: s.array(
        'The labels for the x-axis',
        s.string('an individual label'),
      ),
      datasets: s.array(
        'The datasets for the chart',
        s.object('a dataset', {
          label: s.string('the label of the dataset'),
          data: s.array(
            'the data points for the dataset',
            s.number('a data point'),
          ),
          borderColor: s.string('the CSS color of the dataset'),
          backgroundColor: s.string('the CSS color of the dataset'),
          tension: s.number(
            'A number between 0 and 1 that controls the tension of the line',
          ),
        }),
      ),
    }),
  }),
  s.object('a bar chart', {
    type: s.literal('bar'),
    data: s.object('The data for a bar chart', {
      labels: s.array(
        'The labels for the x-axis',
        s.string('an individual label'),
      ),
      datasets: s.array(
        'The datasets for the chart',
        s.object('a dataset', {
          label: s.string('the label of the dataset'),
          data: s.array(
            'the data points for the dataset',
            s.number('a data point'),
          ),
          backgroundColor: s.array(
            'the CSS colors for the dataset',
            s.string('a CSS color'),
          ),
        }),
      ),
    }),
  }),
  s.object('a pie chart', {
    type: s.literal('pie'),
    data: s.object('The data for a pie chart', {
      labels: s.array(
        'The labels for the pie chart',
        s.string('an individual label'),
      ),
      datasets: s.array(
        'The datasets for the pie chart',
        s.object('a dataset', {
          label: s.string('the label of the dataset'),
          data: s.array(
            'the data points for the dataset',
            s.number('a data point'),
          ),
          backgroundColor: s.array(
            'the CSS colors for the dataset',
            s.string('a CSS color'),
          ),
        }),
      ),
    }),
  }),
]);

export const chartSchema = s.object('a chart', {
  chart: chartTypeSchema,
  options: optionsSchema,
});
