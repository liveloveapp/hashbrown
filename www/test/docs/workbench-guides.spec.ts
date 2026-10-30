import {
  createScanner,
  LanguageVariant,
  ScriptTarget,
  SyntaxKind,
} from 'typescript';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { parseWorkbenchCapture } from '../../examples/quickstart/runtime/workbench-capture';
import { workbenchLessons } from '../../examples/quickstart/runtime/workbench-lessons';
import { DOCS_DEMOS } from '../../src/components/elements/docs-demo-media';
import {
  assertWorkbenchLesson,
  WORKBENCH_LESSONS_WITHOUT_CAPTURE,
  workbenchMediaId,
} from '../../src/components/workbench/workbench-lessons';
import { readDoc, type Sdk, SDKS } from '../../src/lib/content';

test.each(SDKS)(
  '%s concept lessons share the canonical plan and teach before their inline workbench',
  (sdk) => {
    const lessons = [
      ['components', 'ui'],
      ['functions', 'tools'],
      ['structured-output', 'structured'],
      ['streaming', 'streaming'],
      ['schema', 'schemas'],
      ['decisions', 'decisions'],
      ['debugging', 'debugging'],
      ['transform-request-options', 'request-transformation'],
    ] as const;

    for (const [slug, lesson] of lessons) {
      const body = readDoc(sdk, ['concept', slug])?.body ?? '';
      const video = `<hb-docs-demo demo="canonical-workbench-${lesson}-${sdk}">`;

      expect(body).not.toContain(video);
      expect(body).toContain('two-step plan');
      expect(body).toContain(
        `<hb-workbench lesson="${slug === 'components' ? 'generative-ui' : slug === 'functions' ? 'tools' : slug === 'schema' ? 'schemas' : slug === 'transform-request-options' ? 'request-transformation' : slug}">`,
      );
      expect(body).toContain(`/docs/${sdk}/start/workbench`);
      expect(body).toContain(
        lesson === 'decisions' ? 'Use suggestion' : 'Accept plan',
      );
      expect(body).not.toMatch(/shopping-list|MarkdownComponent|fetchUser/);
    }
  },
);

test.each(SDKS)(
  '%s lesson excerpts come directly from the checked workbench clients',
  (sdk) => {
    const pages = [
      'components',
      'functions',
      'structured-output',
      'streaming',
      'schema',
      'decisions',
      'debugging',
      'transform-request-options',
    ].map((slug) => readDoc(sdk, ['concept', slug])?.body ?? '');
    let checked = 0;

    for (const body of pages) {
      for (const match of body.matchAll(
        /<hb-code-example header="((?:react|angular|runtime)\/[^"]+)"(?: moment="[^"]+")?>\s*```[^\n]+\n([\s\S]*?)\n```/g,
      )) {
        const source = readFileSync(
          resolve(import.meta.dirname, '../../examples/quickstart', match[1]),
          'utf8',
        );
        const normalize = (value: string) => {
          const scanner = createScanner(
            ScriptTarget.Latest,
            true,
            LanguageVariant.JSX,
            value,
          );
          const tokens: string[] = [];
          for (
            let kind = scanner.scan();
            kind !== SyntaxKind.EndOfFileToken;
            kind = scanner.scan()
          ) {
            if (kind === SyntaxKind.CommaToken) {
              const next = scanner.lookAhead(() => scanner.scan());
              if (next === SyntaxKind.CloseParenToken) continue;
            }
            tokens.push(`${kind}:${scanner.getTokenText()}`);
          }
          return tokens.join('\u001f');
        };

        expect(normalize(source), match[1]).toContain(normalize(match[2]));
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  },
);

const docsRoot = resolve(import.meta.dirname, '../../content/docs');

function docsPages(): { path: string; sdk: Sdk; body: string }[] {
  return SDKS.flatMap((sdk) =>
    readdirSync(join(docsRoot, sdk), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.md'))
      .map((file) => ({
        path: `${sdk}/${file}`,
        sdk,
        body: readFileSync(join(docsRoot, sdk, file), 'utf8'),
      })),
  );
}

test('inline workbench walkthroughs follow the concept, with no video teaser', () => {
  const pages = docsPages().filter((page) =>
    page.body.includes('<hb-workbench '),
  );

  expect(pages.length).toBeGreaterThan(40);
  for (const page of pages) {
    const teaser = page.body.indexOf(
      '<hb-docs-demo demo="canonical-workbench-',
    );
    const firstSection = page.body.indexOf('\n## ');
    const boundary = page.body.indexOf('\n## Explore it in the workbench');
    const panel = page.body.indexOf('<hb-workbench ');
    expect(teaser, page.path).toBe(-1);
    expect(firstSection, page.path).toBeGreaterThan(-1);
    expect(boundary, page.path).toBeGreaterThan(firstSection);
    expect(panel, page.path).toBeGreaterThan(boundary);
  }
});

test('every hb-workbench lesson is a known lesson with a published capture', () => {
  const lessonIds = new Set<string>(
    workbenchLessons.map((lesson) => lesson.id),
  );
  const embeds = docsPages().flatMap((page) =>
    [...page.body.matchAll(/<hb-workbench lesson="([^"]+)">/g)].map(
      (match) => ({ path: page.path, lesson: match[1] }),
    ),
  );
  const lessons = [...new Set(embeds.map((embed) => embed.lesson))];

  const unknown = embeds.filter((embed) => !lessonIds.has(embed.lesson));
  const problems = lessons
    .filter((lesson) => lessonIds.has(lesson))
    .flatMap((lesson) =>
      SDKS.flatMap((sdk) => {
        const id = assertWorkbenchLesson(lesson);
        const mediaId = workbenchMediaId(id, sdk);
        const issues: string[] = [];
        if (!Object.hasOwn(DOCS_DEMOS, mediaId)) {
          issues.push(`${mediaId}: no recorded video`);
        }
        if (WORKBENCH_LESSONS_WITHOUT_CAPTURE.includes(id)) return issues;
        const file = resolve(
          import.meta.dirname,
          '../../public/video/docs',
          `${mediaId}-capture.json`,
        );
        if (!existsSync(file)) return [...issues, `${mediaId}: no capture`];
        const capture = parseWorkbenchCapture(
          JSON.parse(readFileSync(file, 'utf8')),
        );
        if (capture === null) return [...issues, `${mediaId}: unparseable`];
        if (capture.lesson !== id || capture.framework !== sdk) {
          issues.push(
            `${mediaId}: records ${capture.lesson}/${capture.framework}`,
          );
        }
        return issues;
      }),
    );

  expect(lessons.length).toBeGreaterThan(20);
  expect(unknown).toEqual([]);
  expect(problems).toEqual([]);
});

test('every hb-workbench embed is an opening and closing tag pair', () => {
  const pages = docsPages();

  const embeds = pages.filter((page) => page.body.includes('<hb-workbench '));

  expect(embeds.length).toBeGreaterThan(40);
  for (const page of embeds) {
    expect(page.body, page.path).toMatch(
      /<hb-workbench lesson="[^"]+">\n<\/hb-workbench>/,
    );
  }
});

test('every lesson outside the exemption list publishes a capture per SDK', () => {
  const dir = resolve(import.meta.dirname, '../../public/video/docs');

  const missing = workbenchLessons
    .filter((lesson) => !WORKBENCH_LESSONS_WITHOUT_CAPTURE.includes(lesson.id))
    .flatMap((lesson) =>
      SDKS.map((sdk) => `${workbenchMediaId(lesson.id, sdk)}-capture.json`),
    )
    .filter((name) => !existsSync(join(dir, name)));

  expect(WORKBENCH_LESSONS_WITHOUT_CAPTURE).toEqual([]);
  expect(missing).toEqual([]);
});
