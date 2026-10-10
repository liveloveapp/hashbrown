import { createApp } from './app';
import { readRunOptions } from './run-handler';

try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the environment.
}

createApp({ run: readRunOptions(process.env) }).listen(
  4340,
  '127.0.0.1',
  () => {
    console.log('atc server on http://127.0.0.1:4340');
  },
);
