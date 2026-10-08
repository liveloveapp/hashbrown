import { prompt } from '../prompt/prompt';
import { s } from '../schema';
import { createUiKit } from './ui-kit';
import { createUiJsonSchema } from './ui-json-schema';

const metric = {
  name: 'metric',
  description: 'A KPI metric card',
  props: {
    label: s.string('The metric label'),
    value: s.number('The metric value'),
  },
};

const chart = {
  name: 'chart',
  description: 'A bar chart',
  props: {
    title: s.string('Chart title'),
    data: s.array(
      'Bars',
      s.object('Bar', { label: s.string('Label'), value: s.number('Value') }),
    ),
  },
};

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

test('createUiJsonSchema matches the schema a UI kit sends for the same components', () => {
  const components = [metric, chart];
  const kit = createUiKit({
    components: components.map((definition) => ({
      ...definition,
      component: {},
    })),
  });

  const schema = createUiJsonSchema({ components });

  expect(schema).toEqual(toJson(s.toJsonSchema(kit.schema)));
});

test('createUiJsonSchema includes compiled examples in the schema description', () => {
  const examples = prompt`
    <ui>
      <metric label="Revenue" value=${184302} />
    </ui>
  `;

  const schema = createUiJsonSchema({ components: [metric], examples });

  expect(schema['description']).toContain('Revenue');
  expect(schema['description']).toContain('184302');
});

test('createUiJsonSchema matches a kit that reuses a child component at the top level', () => {
  const panel = {
    name: 'panel',
    description: 'A panel holding other components',
    children: [metric, chart],
  };
  const exposedMetric = { ...metric, component: {} };
  const exposedChart = { ...chart, component: {} };
  const kit = createUiKit({
    components: [
      { ...panel, component: {}, children: [exposedMetric, exposedChart] },
      exposedMetric,
      exposedChart,
    ],
  });

  const schema = createUiJsonSchema({ components: [panel, metric, chart] });

  expect(schema).toEqual(toJson(s.toJsonSchema(kit.schema)));
});

test('createUiJsonSchema returns plain JSON', () => {
  const card = {
    name: 'card',
    description: 'A customer card',
    props: {
      customerId: s.anyOf([s.string('A customer ID'), s.nullish()]),
    },
  };

  const schema = createUiJsonSchema({ components: [card] });

  expect(toJson(schema)).toStrictEqual(schema);
});

test('createUiJsonSchema rejects two different components with the same name', () => {
  const other = { ...metric, description: 'Another metric' };

  const create = () => createUiJsonSchema({ components: [metric, other] });

  expect(create).toThrow(/Component name collision for "metric"/);
});

test('createUiJsonSchema rejects invalid examples', () => {
  const examples = prompt`<ui><unknown label="x" /></ui>`;

  const create = () => createUiJsonSchema({ components: [metric], examples });

  expect(create).toThrow(/Example prompt has/);
});
