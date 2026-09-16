import { rm } from 'node:fs/promises';

const outputDirectories = [
  new URL('../../../../dist/www/analog', import.meta.url),
  new URL('../../../../.vercel/output', import.meta.url),
];

await Promise.all(
  outputDirectories.map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ),
);
