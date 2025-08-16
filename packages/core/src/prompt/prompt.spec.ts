/* eslint-disable @typescript-eslint/no-explicit-any */
import { prompt } from '../public_api';
import { s } from '../schema';

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
      expect(first && first.$tagName).toBe('Markdown');
      expect(first && first.$props['data']).toEqual(rich);
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

      const n = sys.examples[0] && sys.examples[0][0];

      expect(n && n.$props['a']).toBe(true);
      expect(n && n.$props['b']).toBe(false);
      expect(n && n.$props['c']).toBeCloseTo(3.14);
      expect(n && n.$props['d']).toBeNull();
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
          props: { data: s.object('data', { text: s.string('text') }) },
          children: false,
        },
      ];

      const compiled = example.compile(components);

      expect(typeof compiled).toBe('string');
      expect(example.diagnostics.length).toBe(0);
    });

    it('compiles valid Angular selector alias without diagnostics', () => {
      const example = prompt`<ui><app-markdown data=${{ text: 'x' }} /></ui>`;
      const components = [
        {
          name: 'Markdown',
          selector: 'app-markdown',
          props: { data: s.object('data', { text: s.string('text') }) },
          children: false,
        },
      ];

      example.compile(components);

      expect(example.diagnostics.length).toBe(0);
    });

    it('validates streaming type props successfully', () => {
      const input = { t: 'ok' };
      const example = prompt`<ui><Stream data=${input} /></ui>`;
      const components = [
        {
          name: 'Stream',
          props: { data: s.streaming.object('obj', { t: s.string('t') }) },
          children: false,
        },
      ];

      example.compile(components);

      expect(example.diagnostics.length).toBe(0);
    });

    it('children: any allows arbitrary nested elements', () => {
      const example = prompt`<ui><Container><Inner /></Container></ui>`;
      const components = [
        { name: 'Container', props: {}, children: 'any' },
        { name: 'Inner', props: {}, children: false },
      ] as any[];

      example.compile(components);

      expect(example.diagnostics.length).toBe(0);
    });

    it('children: only listed child passes validation', () => {
      const example = prompt`<ui><Parent><Child /></Parent></ui>`;
      const components = [
        {
          name: 'Parent',
          props: {},
          children: [{ name: 'Child', props: {}, children: false }],
        },
        { name: 'Child', props: {}, children: false },
      ] as any[];

      example.compile(components);

      expect(example.diagnostics.length).toBe(0);
    });

    it('compile returns original author text unchanged', () => {
      const sys = prompt`hello <ui><X /></ui> world`;

      const compiled = sys.compile([]);

      expect(compiled).toContain('hello');
      expect(compiled).toContain('world');
      expect(compiled).toContain('<ui>');
    });
  });

  describe('compile validation - failure signals remain', () => {
    it('unknown tag emits E1001 and suggestion', () => {
      const sys = prompt`<ui><Ligth /></ui>`;
      const components = [{ name: 'Light', props: {}, children: false }];

      sys.compile(components);

      const codes = sys.diagnostics.map((d) => d.code);
      expect(codes).toContain('E1001');
    });

    it('missing required prop emits E1102', () => {
      const sys = prompt`<ui><Markdown /></ui>`;
      const components = [
        {
          name: 'Markdown',
          props: { data: s.string('data') },
          children: false,
        },
      ];

      sys.compile(components);

      const codes = sys.diagnostics.map((d) => d.code);
      expect(codes).toContain('E1102');
    });

    it('prop schema mismatch emits E1203', () => {
      const sys = prompt`<ui><Markdown data=${{ text: 123 }} /></ui>`;
      const components = [
        {
          name: 'Markdown',
          props: { data: s.object('data', { text: s.string('text') }) },
          children: false,
        },
      ];

      sys.compile(components);

      const codes = sys.diagnostics.map((d) => d.code);
      expect(codes).toContain('E1203');
    });

    it('disallowed child emits W2101', () => {
      const sys = prompt`<ui><Parent><NotAllowed /></Parent></ui>`;
      const components = [
        {
          name: 'Parent',
          props: {},
          children: [{ name: 'Child', props: {}, children: false }],
        },
        { name: 'Child', props: {}, children: false },
      ] as any[];

      sys.compile(components);

      const codes = sys.diagnostics.map((d) => d.code);
      expect(codes).toContain('W2101');
    });
  });

  describe('compile output string shape', () => {
    it('returns the exact author string when simple', () => {
      const sys = prompt`Intro<ui><X a="1" /></ui>Outro`;

      const out = sys.compile([]);

      expect(out).toBe('Intro<ui><X a="1" /></ui>Outro');
    });

    it('does not inline JSON or fences for examples', () => {
      const sys = prompt`Text<ui><Node /></ui>Tail`;

      const out = sys.compile([]);

      expect(out).toContain('<ui>');
      expect(out).not.toContain('```json');
      expect(out).not.toContain('"$tagName"');
    });

    it('retains placeholder sentinels for ${} values inside <ui>', () => {
      const val = { a: 1 };
      const sys = prompt`A<ui><X data=${val} /></ui>Z`;

      const out = sys.compile([]);

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
        { name: 'X', props: {}, children: false },
        { name: 'Y', props: {}, children: false },
        { name: 'Z', props: {}, children: false },
      ];

      const out = sys.compile(components, { exampleInjection: 'inline' });

      // It should contain two fenced JSON blocks and no literal <ui> tags
      const fences = out.match(/```json[\s\S]*?```/g) || [];
      expect(fences.length).toBe(2);
      expect(out).not.toContain('<ui>');

      // Parse the first fence JSON and assert the tags
      const firstJson = (fences[0] ?? '')
        .replace(/^```json\n/, '')
        .replace(/\n```$/, '');
      const arr1 = JSON.parse(firstJson);
      expect(Array.isArray(arr1)).toBe(true);
      expect(arr1[0].$tagName).toBe('X');
      expect(arr1[1].$tagName).toBe('Y');

      // Second fence should be a single node Z
      const secondJson = (fences[1] ?? '')
        .replace(/^```json\n/, '')
        .replace(/\n```$/, '');
      const arr2 = JSON.parse(secondJson);
      expect(arr2.length).toBe(1);
      expect(arr2[0].$tagName).toBe('Z');
    });

    it('placeholder: replaces <ui> blocks with labeled markers', () => {
      const sys = prompt`A<ui><One /></ui>B<ui><Two /></ui>C`;
      const components = [
        { name: 'One', props: {}, children: false },
        { name: 'Two', props: {}, children: false },
      ];

      const out = sys.compile(components, { exampleInjection: 'placeholder' });

      expect(out).toContain('[See compiled UI example A]');
      expect(out).toContain('[See compiled UI example B]');
      expect(out).not.toContain('<ui>');
      expect(out).not.toContain('```json');
    });
  });
});
