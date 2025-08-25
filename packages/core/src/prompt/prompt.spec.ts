/* eslint-disable @typescript-eslint/no-explicit-any */
import { prompt } from './prompt';
import { s } from '../schema';
import { createComponentSchema } from '../ui';

describe('prompt helper', () => {
  describe('weaving and extraction', () => {
    it('weaves placeholders and lowers to HBTree', () => {
      const rich = { text: 'Hello', tags: ['greeting'] };

      const sys = prompt`
        intro
        <ui>
          <Markdown data=${rich} />
        </ui>
        outro
      `;

      expect(sys.examples.length).toBe(1);
      const tree = sys.examples[0];
      expect(Array.isArray(tree)).toBe(true);
      const first = tree && tree[0];
      expect(first && first.$tag).toBe('Markdown');
      expect(first && (first as any).data).toEqual(rich);
    });

    it('extracts multiple <ui> blocks', () => {
      const input = prompt`
        <ui><One /></ui>
        middle
        <ui><Two a="1" /></ui>
      `;

      const { examples, meta } = input;

      expect(examples.length).toBe(2);
      expect(meta.uiBlocks.length).toBe(2);
    });

    it('flags unserializable values (Date, function)', () => {
      const dt = new Date();
      const fn = () => 0;

      const sys = prompt`<ui><A a=${dt} b=${fn} /></ui>`;

      const codes = sys.diagnostics.map((d) => d.code);
      expect(codes).toContain('E1301');
    });

    it('parses boolean/number/null attr strings', () => {
      const sys = prompt`<ui><Comp a="true" b="false" c="3.14" d="null" /></ui>`;

      const n: any = sys.examples[0] && sys.examples[0][0];

      expect(n && n.a).toBe(true);
      expect(n && n.b).toBe(false);
      expect(n && n.c).toBeCloseTo(3.14);
      expect(n && n.d).toBeNull();
    });

    it('duplicate attributes are flagged', () => {
      const sys = prompt`<ui><Comp a="1" a="2" /></ui>`;

      const hasDup = sys.diagnostics.some((d) => d.code === 'E1401');

      expect(hasDup).toBe(true);
    });
  });

  describe('compile validation - success paths', () => {
    it('compiles valid React-style tag without diagnostics', () => {
      const example = prompt`<ui><Markdown data=${{ text: 'hi' }} /></ui>`;
      const components = [
        {
          name: 'Markdown',
          component: createMockComponent(),
          description: '',
          props: { data: s.object('data', { text: s.string('text') }) },
          children: false,
        } as const,
      ];

      const compiled = example.compile(components, toSchema(components));

      expect(typeof compiled).toBe('string');
      expect(example.diagnostics.length).toBe(0);
    });

    it('compiles valid Angular selector alias without diagnostics', () => {
      const example = prompt`<ui><app-markdown data=${{ text: 'x' }} /></ui>`;
      const components = [
        {
          name: 'Markdown',
          component: createMockComponent(),
          selector: 'app-markdown',
          description: '',
          props: { data: s.object('data', { text: s.string('text') }) },
          children: false,
        } as const,
      ];

      example.compile(components, toSchema(components));

      expect(example.diagnostics.length).toBe(0);
    });

    it('validates streaming type props successfully', () => {
      const input = { t: 'ok' };
      const example = prompt`<ui><Stream data=${input} /></ui>`;
      const components = [
        {
          name: 'Stream',
          component: createMockComponent(),
          description: '',
          props: { data: s.streaming.object('obj', { t: s.string('t') }) },
          children: false,
        } as const,
      ];

      example.compile(components, toSchema(components));

      expect(example.diagnostics.length).toBe(0);
    });

    it('children: any allows arbitrary nested elements', () => {
      const example = prompt`<ui><Container><Inner /></Container></ui>`;
      const components = [
        {
          name: 'Container',
          component: createMockComponent(),
          description: '',
          props: {},
          children: 'any',
        } as const,
        {
          name: 'Inner',
          component: createMockComponent(),
          description: '',
          props: {},
          children: false,
        } as const,
      ];

      example.compile(components, toSchema(components));

      expect(example.diagnostics.length).toBe(0);
    });

    it('children: text captures raw text content', () => {
      const example = prompt`<ui><Note>Hello world!</Note></ui>`;
      const components = [
        {
          name: 'Note',
          component: createMockComponent(),
          description: '',
          props: {},
          children: 'text',
        } as const,
      ];

      const out = example.compile(components, toSchema(components));

      // Should have no diagnostics
      expect(example.diagnostics.length).toBe(0);

      // Extract the injected JSON and verify $children is a string
      const fence = (out.match(/```json[\s\S]*?```/) || [])[0] || '';
      const json = fence.replace(/^```json\n/, '').replace(/\n```$/, '');
      const obj = JSON.parse(json);
      // Streaming shape injects an object with a top-level `ui` array where
      // entries are objects keyed by component name. For text-children
      // components, the value is the string content.
      expect(Array.isArray(obj.ui)).toBe(true);
      expect(typeof obj.ui[0].Note).toBe('object');
      expect(obj.ui[0].Note.$children).toBe('Hello world!');
    });

    it('children: only listed child passes validation', () => {
      const example = prompt`<ui><Parent><Child /></Parent></ui>`;
      const components = [
        {
          name: 'Parent',
          component: createMockComponent(),
          description: '',
          props: {},
          children: [
            {
              name: 'Child',
              component: createMockComponent(),
              description: '',
              props: {},
              children: false,
            } as const,
          ],
        },
        {
          name: 'Child',
          component: createMockComponent(),
          description: '',
          props: {},
          children: false,
        } as const,
      ];

      example.compile(components, toSchema(components));

      expect(example.diagnostics.length).toBe(0);
    });

    it('compile returns original author text unchanged', () => {
      const sys = prompt`hello <ui><X /></ui> world`;

      const compiled = sys.compile([], toSchema([]));

      expect(compiled).toContain('hello');
      expect(compiled).toContain('world');
      expect(compiled).toContain('<ui>');
    });
  });

  describe('compile validation - failure signals remain', () => {
    it('unknown tag emits E1001 and suggestion', () => {
      const sys = prompt`<ui><Ligth /></ui>`;
      const components = [
        {
          name: 'Light',
          component: createMockComponent(),
          description: '',
          props: {},
          children: false,
        } as const,
      ];
      sys.compile(components, toSchema(components));

      const codes = sys.diagnostics.map((d) => d.code);
      expect(codes).toContain('E1001');
    });

    it('missing required prop emits E1102', () => {
      const sys = prompt`<ui><Markdown /></ui>`;
      const components = [
        {
          name: 'Markdown',
          component: createMockComponent(),
          description: '',
          props: { data: s.string('data') },
          children: false,
        } as const,
      ];

      sys.compile(components, toSchema(components));

      const codes = sys.diagnostics.map((d) => d.code);
      expect(codes).toContain('E1102');
    });

    it('prop schema mismatch emits E1203', () => {
      const sys = prompt`<ui><Markdown data=${{ text: 123 }} /></ui>`;
      const components = [
        {
          name: 'Markdown',
          component: createMockComponent(),
          description: '',
          props: { data: s.object('data', { text: s.string('text') }) },
          children: false,
        } as const,
      ];

      sys.compile(components, toSchema(components));

      const codes = sys.diagnostics.map((d) => d.code);
      expect(codes).toContain('E1203');
    });

    it('disallowed child emits W2101', () => {
      const sys = prompt`<ui><Parent><NotAllowed /></Parent></ui>`;
      const components = [
        {
          name: 'Parent',
          component: createMockComponent(),
          description: '',
          props: {},
          children: [
            {
              name: 'Child',
              component: createMockComponent(),
              description: '',
              props: {},
              children: false,
            } as const,
          ],
        },
        {
          name: 'Child',
          component: createMockComponent(),
          description: '',
          props: {},
          children: false,
        } as const,
      ];

      sys.compile(components, toSchema(components));

      const codes = sys.diagnostics.map((d) => d.code);
      expect(codes).toContain('W2101');
    });

    it('children: text with element child emits W2101', () => {
      const sys = prompt`<ui><Note><X /></Note></ui>`;
      const components = [
        {
          name: 'Note',
          component: createMockComponent(),
          description: '',
          props: {},
          children: 'text',
        } as const,
        {
          name: 'X',
          component: createMockComponent(),
          description: '',
          props: {},
          children: false,
        } as const,
      ];

      sys.compile(components, toSchema(components));

      const codes = sys.diagnostics.map((d) => d.code);
      expect(codes).toContain('W2101');
    });
  });

  describe('compile output string shape', () => {
    it('returns the exact author string when simple', () => {
      const sys = prompt`Intro<ui><X a="1" /></ui>Outro`;

      const out = sys.compile([], toSchema([]));

      expect(out).toBe('Intro<ui><X a="1" /></ui>Outro');
    });

    it('does not inline JSON or fences for examples', () => {
      const sys = prompt`Text<ui><Node /></ui>Tail`;

      const out = sys.compile([], toSchema([]));

      expect(out).toContain('<ui>');
      expect(out).not.toContain('```json');
      expect(out).not.toContain('"$tag"');
    });

    it('retains placeholder sentinels for ${} values inside <ui>', () => {
      const val = { a: 1 };
      const sys = prompt`A<ui><X data=${val} /></ui>Z`;

      const out = sys.compile([], toSchema([]));

      expect(out).toContain('<ui>');
      expect(out).toMatch(/__HBX_0__/);
    });
  });

  describe('example injection modes', () => {
    it('inline: replaces <ui> blocks with fenced JSON HBTree', () => {
      const sys = prompt`
        Head
        <ui><X /><Y /></ui>
        Middle
        <ui><Z /></ui>
        Tail
      `;
      const components = [
        {
          name: 'X',
          component: createMockComponent(),
          description: '',
          props: {},
          children: false,
        } as const,
        {
          name: 'Y',
          component: createMockComponent(),
          description: '',
          props: {},
          children: false,
        } as const,
        {
          name: 'Z',
          component: createMockComponent(),
          description: '',
          props: {},
          children: false,
        } as const,
      ];

      const out = sys.compile(components, toSchema(components));

      expect(out).toMatchSnapshot();
    });
  });
});

test('full integration with streaming', () => {
  const sys = prompt`
    <ui>
      <Markdown data=${{ text: 'hi' }} />
      <CardList>
        <LightCard title="Light 1" id="uuid123" />
        <LightCard title="Light 2" id="uuid456" />
      </CardList>
    </ui>
  `;

  const components = [
    {
      name: 'Markdown',
      component: createMockComponent(),
      description: '',
      props: { data: s.streaming.object('data', { text: s.string('text') }) },
      children: false,
    } as const,
    {
      name: 'CardList',
      component: createMockComponent(),
      description: '',
      props: {},
      children: 'any',
    } as const,
    {
      name: 'LightCard',
      component: createMockComponent(),
      description: '',
      props: { title: s.string('title'), id: s.string('id') },
      children: false,
    } as const,
  ];

  const out = sys.compile(components, toSchema(components));

  expect(out).toMatchSnapshot();
});

function toSchema(components: any[]) {
  return s.object('UI', {
    ui: s.streaming.array(
      'List of elements',
      createComponentSchema(components),
    ),
  });
}

function createMockComponent() {
  return class {};
}
