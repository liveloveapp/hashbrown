import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { parseInsight } from './schema.ts';
import {
  documentedEvents,
  TELEMETRY_EVENT_CONTRACT,
} from './telemetry-contract.ts';

const HERE = import.meta.dirname;
const TAXONOMY_PATH = join(HERE, '..', '..', 'docs', 'growth', 'taxonomy.md');

async function insightEvents(): Promise<Set<string>> {
  const dir = join(HERE, 'insights');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json'));
  const events = new Set<string>();
  for (const file of files) {
    const insight = parseInsight(
      JSON.parse(await readFile(join(dir, file), 'utf8')),
    );
    for (const item of [...insight.events, ...(insight.steps ?? [])])
      events.add(item.event);
  }
  return events;
}

test('every insight event is in the taxonomy', async () => {
  const taxonomy = await readFile(TAXONOMY_PATH, 'utf8');

  const referenced = await insightEvents();
  const documented = documentedEvents(taxonomy);

  expect(referenced.size).toBeGreaterThan(0);
  expect(
    [...referenced].filter((event) => !documented.has(event)).sort(),
  ).toEqual([]);
});

test('every contract event is in the taxonomy', async () => {
  const taxonomy = await readFile(TAXONOMY_PATH, 'utf8');

  const documented = documentedEvents(taxonomy);

  expect(
    Object.keys(TELEMETRY_EVENT_CONTRACT)
      .filter((event) => !documented.has(event))
      .sort(),
  ).toEqual([]);
});
