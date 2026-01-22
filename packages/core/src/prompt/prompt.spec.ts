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
      const entry = first && Object.entries(first)[0];
      expect(entry && entry[0]).toBe('Markdown');
      expect(entry && (entry[1] as any)?.props?.data).toEqual(rich);
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
      const entry = n && Object.entries(n)[0];
      const props = entry?.[1]?.props;

      expect(props && props.a).toBe(true);
      expect(props && props.b).toBe(false);
      expect(props && props.c).toBeCloseTo(3.14);
      expect(props && props.d).toBeNull();
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
      const json = (out.match(/\[[\s\S]*\]/) || [])[0] || '';

      const obj = JSON.parse(json);
      expect(Array.isArray(obj)).toBe(true);
      expect(obj[0].Note).toBeDefined();
      expect(obj[0].Note.children).toBe('Hello world!');
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

  describe('non-UI placeholder replacement', () => {
    it('replaces string placeholders outside <ui> blocks', () => {
      const greeting = 'Hello';
      const name = 'World';
      const sys = prompt`${greeting} ${name}!`;

      const out = sys.compile([], toSchema([]));

      expect(out).toBe('Hello World!');
      expect(out).not.toContain('__HBX_');
    });

    it('replaces number placeholders', () => {
      const num = 42;
      const sys = prompt`The answer is ${num}.`;

      const out = sys.compile([], toSchema([]));

      expect(out).toBe('The answer is 42.');
    });

    it('replaces boolean placeholders', () => {
      const isTrue = true;
      const isFalse = false;
      const sys = prompt`True: ${isTrue}, False: ${isFalse}`;

      const out = sys.compile([], toSchema([]));

      expect(out).toBe('True: true, False: false');
    });

    it('replaces null and undefined with empty string', () => {
      const nullVal = null;
      const undefVal = undefined;
      const sys = prompt`Null: ${nullVal}, Undefined: ${undefVal}`;

      const out = sys.compile([], toSchema([]));

      expect(out).toBe('Null: , Undefined: ');
    });

    it('stringifies object placeholders with formatting', () => {
      const data = { name: 'Alice', age: 30 };
      const sys = prompt`User data: ${data}`;

      const out = sys.compile([], toSchema([]));

      expect(out).toContain('User data:');
      expect(out).toContain('"name": "Alice"');
      expect(out).toContain('"age": 30');
      expect(out).not.toContain('__HBX_');
    });

    it('stringifies array placeholders', () => {
      const items = ['apple', 'banana', 'cherry'];
      const sys = prompt`Items: ${items}`;

      const out = sys.compile([], toSchema([]));

      expect(out).toContain('Items:');
      expect(out).toContain('"apple"');
      expect(out).toContain('"banana"');
      expect(out).toContain('"cherry"');
    });

    it('handles mixed UI blocks and non-UI placeholders', () => {
      const title = 'Documentation';
      const docs = [{ url: '/docs/1', title: 'Doc 1' }];
      const sys = prompt`
        # ${title}

        ## Available Docs
        ${docs}

        <ui><Link href="/home" /></ui>
      `;

      const components = [
        {
          name: 'Link',
          component: createMockComponent(),
          description: '',
          props: { href: s.string('href') },
          children: false,
        } as const,
      ];

      const out = sys.compile(components, toSchema(components));

      expect(out).toContain('# Documentation');
      expect(out).toContain('## Available Docs');
      expect(out).toContain('"url": "/docs/1"');
      expect(out).toContain('"title": "Doc 1"');
      expect(out).not.toContain('__HBX_');
    });

    it('replaces placeholders appearing after lowered <ui> blocks', () => {
      const trailing = 'outside';
      const sys = prompt`
        <ui>
          <Link href="/home">Home</Link>
        </ui>

        trailing content: ${trailing}
      `;

      const components = [
        {
          name: 'Link',
          component: createMockComponent(),
          description: '',
          props: { href: s.string('href') },
          children: false,
        } as const,
      ];

      const out = sys.compile(components, toSchema(components));

      expect(out).toContain('trailing content: outside');
      expect(out).not.toContain('__HBX_');
    });

    it('replaces multiple occurrences of same placeholder', () => {
      const keyword = 'test';
      const sys = prompt`${keyword} is ${keyword}, ${keyword}!`;

      const out = sys.compile([], toSchema([]));

      expect(out).toBe('test is test, test!');
    });

    it('handles complex nested objects', () => {
      const config = {
        api: { url: 'https://api.example.com', timeout: 5000 },
        features: ['auth', 'logging'],
      };
      const sys = prompt`Configuration: ${config}`;

      const out = sys.compile([], toSchema([]));

      expect(out).toContain('Configuration:');
      expect(out).toContain('"url": "https://api.example.com"');
      expect(out).toContain('"timeout": 5000');
      expect(out).toContain('"auth"');
      expect(out).toContain('"logging"');
    });

    it('preserves JSON.stringify formatting with proper indentation', () => {
      const data = { a: 1, b: { c: 2 } };
      const sys = prompt`Data:\n${data}`;

      const out = sys.compile([], toSchema([]));

      // Check for 2-space indentation (JSON.stringify default)
      expect(out).toContain('  "a": 1');
      expect(out).toContain('  "b": {');
      expect(out).toContain('    "c": 2');
    });

    it('works with real-world documentation scenario', () => {
      const docs = [
        {
          url: '/docs/intro',
          title: 'Introduction',
          description: 'Get started',
        },
        {
          url: '/docs/api',
          title: 'API Reference',
          description: 'Full API docs',
        },
      ];

      const sys = prompt`
        You are a documentation assistant.

        ## Available Documentation

        \`\`\`json
        ${docs}
        \`\`\`

        Use the documentation above to answer questions.

        <ui><SearchResult url="/docs/intro" title="Introduction" /></ui>
      `;

      const components = [
        {
          name: 'SearchResult',
          component: createMockComponent(),
          description: '',
          props: {
            url: s.string('url'),
            title: s.string('title'),
          },
          children: false,
        } as const,
      ];

      const out = sys.compile(components, toSchema(components));

      // Check that non-UI placeholder is replaced
      expect(out).toContain('"url": "/docs/intro"');
      expect(out).toContain('"title": "Introduction"');
      expect(out).toContain('"description": "Get started"');

      // Check that UI block is still processed
      expect(out).toContain('"SearchResult"');

      // No leftover placeholders
      expect(out).not.toContain('__HBX_');
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
