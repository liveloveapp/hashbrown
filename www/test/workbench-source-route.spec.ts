import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { workbenchLessons } from '../examples/quickstart/runtime/workbench-lessons';
import {
  generateStaticParams,
  GET,
} from '../src/app/workbench-source/[sdk]/[lesson]/route';

const quickstart = resolve(import.meta.dirname, '../examples/quickstart');

test('prerenders source for every lesson in both SDKs', () => {
  const params = generateStaticParams();

  expect(params).toHaveLength(workbenchLessons.length * 2);
  expect(params).toContainEqual({ sdk: 'angular', lesson: 'tools' });
});

test('react/tools source is highlighted with addressable lines', async () => {
  const params = Promise.resolve({ sdk: 'react', lesson: 'tools' });

  const response = await GET(new Request('http://localhost'), { params });
  const body = (await response.json()) as {
    files: { path: string; html: string }[];
  };

  const lines = readFileSync(
    resolve(quickstart, 'react/src/Workbench.tsx'),
    'utf8',
  )
    .replace(/\n$/, '')
    .split('\n').length;
  const [wrapper] = body.files;
  expect(response.headers.get('content-type')).toContain('application/json');
  // GitHub links use the page's commit, so the payload carries only files.
  expect(Object.keys(body)).toEqual(['files']);
  expect(body.files.map((file) => file.path)).toEqual([
    'react/src/Workbench.tsx',
    'server/workbench-app.ts',
    'runtime/workbench.ts',
  ]);
  expect(wrapper.html).toContain('class="shiki github-light"');
  expect(wrapper.html).toContain('background-color:#fff');
  expect(wrapper.html).toContain('<span class="line" data-line="1">');
  expect(wrapper.html.match(/data-line="\d+"/g)).toHaveLength(lines);
  expect(wrapper.html).toContain(`data-line="${lines}"`);
});

test('an unknown lesson is not found', async () => {
  const params = Promise.resolve({ sdk: 'react', lesson: 'nope' });

  const response = await GET(new Request('http://localhost'), { params });

  expect(response.status).toBe(404);
});
