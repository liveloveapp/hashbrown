# Testing: recorded provider fixtures

Provider integration specs (`packages/<provider>/src/integration.spec.ts`)
replay fixtures that were recorded once from the live provider APIs through
[aimock](https://github.com/CopilotKit/aimock). Recordings live at
`tools/testing/aimock/fixtures/recorded/<test-slug>/<provider>.json`, where
`<test-slug>` comes from the test name sent as the `X-Test-Id` header. Azure
OpenAI recordings are named `openai.json` under `azure-openai-...` slugs.

## Re-recording

```sh
npx nx record-fixtures <provider>
```

`<provider>` is one of `openai`, `azure`, `anthropic`, `google`, `bedrock`,
`ollama`. The target:

1. loads the developer `.env` (`HASHBROWN_ENV_FILE`, else the nearest `.env`
   walking up from the workspace root, so it works from a git worktree);
2. deletes that provider's recordings (OpenAI and Azure share the file name
   `openai.json`, so they are told apart by the `azure-` slug prefix);
3. runs `AIMOCK_RECORD=1 npx nx e2e <provider> --skip-nx-cache` against the
   real API;
4. runs the credential scan (`npx nx test testing --testFile=recorded-fixtures`).

To list what would be deleted without recording, run
`node tools/testing/aimock/record-fixtures.mjs <provider> --dry-run`. Env values are never printed.

To re-record one test without clearing the provider's other recordings (its old recording is overwritten; delete it first if the prompt changed), run `( set -a; source .env; set +a; AIMOCK_RECORD=1 npx nx e2e <provider> --skip-nx-cache --testFile=src/integration.spec.ts --testNamePattern='<part of the test name>' )`, then the credential scan above.

## Credentials (in `.env`)

| Provider  | Variables                                                                       |
| --------- | ------------------------------------------------------------------------------- |
| OpenAI    | `OPENAI_API_KEY`                                                                |
| Anthropic | `ANTHROPIC_API_KEY`                                                             |
| Google    | `GOOGLE_API_KEY`                                                                |
| Ollama    | `OLLAMA_HOST`, `OLLAMA_MODEL`                                                   |
| Azure     | `AZURE_ENDPOINT`, `AZURE_API_KEY`, `AZURE_API_VERSION` and the deployment names |
| Bedrock   | AWS credentials, `BEDROCK_REGION`, `BEDROCK_MODEL_ID`                           |

Bedrock signs each request for the real regional endpoint and then sends it to
aimock, so recording needs `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (plus
`AWS_SESSION_TOKEN` for temporary credentials) in `.env`; a named `AWS_PROFILE`
is not used. aimock records Bedrock through a local proxy
(`aimock/bedrock-converse-shim.ts`) that works around an aimock bug that saves
Converse streams as empty; delete it once aimock reads Converse events by their
`:event-type` header.

## Cost

Recording makes real, billed API calls: one per recorded case, using the
cheapest model that supports the case with output tokens capped. Re-record a
single provider only when its recorded behaviour needs to change, not on every
run.

## Review before committing

Recording rewrites files, so inspect the diff of `fixtures/recorded/`: the
requests and responses should be what you expect, with no credentials, account
identifiers or endpoints. aimock replaces every configured secret value with
`[REDACTED]` while writing, and the scan runs automatically at the end of
`record-fixtures`; it also runs in `npx nx test testing`, so a leaked
credential fails CI.

## Replay is strict

Without `AIMOCK_RECORD=1`, specs replay with `strict: true`: a request that
matches no recorded fixture gets a 503 naming the missing test slug and file,
and the test fails. Replay needs no API keys. A changed prompt or request
shape therefore requires re-recording.
