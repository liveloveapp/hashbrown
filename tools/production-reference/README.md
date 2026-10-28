# Durable conversation reference

This opt-in TypeScript host serves the canonical Angular and React workbench against a private b4.run runtime and Postgres. It uses the repository's existing dependencies.

Read the [React guide](../../www/content/docs/react/platform/b4run.md) or [Angular guide](../../www/content/docs/angular/platform/b4run.md) for the recovery and ownership boundaries.

```sh
export PRODUCTION_DATABASE_URL='postgresql://localhost/hashbrown_reference'
export PRODUCTION_COOKIE_SECRET='replace-with-a-random-secret-of-at-least-32-characters'
export PRODUCTION_ORIGIN='http://localhost:4310'
export OPENAI_API_KEY='your-server-key'
export OPENAI_MODEL='gpt-4.1-mini'
npx nx workbench-build www
npx nx serve production-reference
```

Open `/react.html?lesson=production-recovery` or `/angular.html?lesson=production-recovery` on that origin. Keep the database, secret and origin unchanged across restarts. The host creates its explicit `hashbrown_production` schema in the supplied dedicated database. It has no in-memory fallback.

The cookie is a signed anonymous identity for this reference. Replace its adapter with the application's verified account principal before using account-owned conversations. Provider keys and the database URL stay on the server.

## Verification

```sh
npx nx build production-reference
npx nx test production-reference
npx nx lint production-reference
PRODUCTION_TEST_DATABASE_URL='postgresql://localhost/disposable_reference_tests' \
  npx nx test-integration production-reference
```

Integration tests require an explicitly supplied disposable Postgres database and create uniquely named runtime tables. They test shared admission, owner isolation, cold reads, approval ledger failures, and the application's atomic receipt. They do not call a model.

## Real recordings

With the server environment above and ffmpeg installed:

```sh
npx nx demo production-reference
```

The recorder starts and replaces its own server processes. Its recording origin defaults to `http://127.0.0.1:4372` when `PRODUCTION_ORIGIN` is unset; otherwise it uses the supplied origin and port, which must be free. Both framework recordings must pass before publishing the staged video, poster, result image, captions and transcript. Masters, failed captures and measured evidence stay in ignored `dist/docs-production-reference/captures/`.

The live gate requires a real server process replacement, one restored native approval, no run during restoration, one application revision and receipt, and no run during playback. These checks demonstrate this database action; they do not establish exactly-once external effects.
