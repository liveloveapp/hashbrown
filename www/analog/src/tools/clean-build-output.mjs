import { rm } from 'node:fs/promises';

const outputDirectory = new URL('../../../../dist/www/analog', import.meta.url);

await rm(outputDirectory, { recursive: true, force: true });
