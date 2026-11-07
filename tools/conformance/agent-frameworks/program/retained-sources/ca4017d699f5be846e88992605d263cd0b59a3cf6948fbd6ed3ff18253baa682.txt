import { readFileSync } from 'node:fs';
import { selectCiSetup } from './ci-selection';

const graph = JSON.parse(readFileSync(process.argv[2], 'utf8')) as {
  tasks: { tasks: Record<string, unknown> };
};
const taskIds = Object.keys(graph.tasks.tasks);
const setup = selectCiSetup(taskIds);
const native = taskIds.some(
  (id) =>
    id.startsWith('pydantic-ai-conformance:') &&
    [
      'install',
      'test',
      'consumer-test',
      'example-e2e',
      'compatibility-baseline',
    ].includes(id.split(':')[1]),
);
const recipe = taskIds.some((id) =>
  id.startsWith('pydantic-ai-recipe-conformance:'),
);
console.log(
  `dotnet=${setup.dotnet}\nbrowser=${setup.browser}\npython=${setup.python}\npython_native=${native}\npython_recipe=${recipe}`,
);
