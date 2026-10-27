import { resolve } from 'node:path';
import { createWorkbenchAppFromEnv } from './workbench-env';

const app = createWorkbenchAppFromEnv(process.env, {
  staticDirectory: resolve('dist/docs-workbench/browser'),
});
app.listen(4370, '127.0.0.1', () =>
  console.log(
    'Canonical docs demo: http://127.0.0.1:4370/react.html and /angular.html',
  ),
);
