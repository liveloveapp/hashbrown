import { readFileSync } from 'node:fs';
import { selectCiSetup } from './ci-selection';

const graph = JSON.parse(readFileSync(process.argv[2], 'utf8')) as {
  tasks: { tasks: Record<string, unknown> };
};
const setup = selectCiSetup(Object.keys(graph.tasks.tasks));
console.log(`dotnet=${setup.dotnet}\nbrowser=${setup.browser}`);
