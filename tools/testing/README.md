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

If a record run fails (a test fails, or a recording holds an empty response),
that provider's recordings have already been deleted. Restore the committed
ones with `git checkout -- tools/testing/aimock/fixtures/recorded`.

### Re-recording one test

```sh
node tools/testing/aimock/record-fixtures.mjs <provider> --only "<exact test name>"
```

This deletes only that test's recording
(`<test-slug>/<provider file>.json`, using the same slug the spec records
under), runs the provider's e2e target with `AIMOCK_RECORD=1` and
`--testNamePattern` matching exactly that name, checks that a recording was
written, then runs the credential scan. It loads `.env` the same way as a full
run, so it works from a git worktree. Add `--dry-run` to print the file and
commands without running them.

The recording has to be deleted first: in record mode aimock still loads the
existing recording, replays any request it matches instead of calling the
real provider, and appends new recordings to the file.

## Credentials (in `.env`)

| Provider  | Variables                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| OpenAI    | `OPENAI_API_KEY`                                                                                                   |
| Anthropic | `ANTHROPIC_API_KEY`                                                                                                |
| Google    | `GOOGLE_API_KEY`                                                                                                   |
| Ollama    | `OLLAMA_HOST`, `OLLAMA_MODEL`                                                                                      |
| Azure     | `AZURE_ENDPOINT`, `AZURE_API_KEY`                                                                                  |
| Bedrock   | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` (optional), `BEDROCK_REGION`, `BEDROCK_MODEL_ID` |

`AZURE_ENDPOINT` must be the Azure OpenAI resource host,
`https://<resource>.openai.azure.com`; the Azure AI Foundry
`*.services.ai.azure.com` host returns 404 for these requests. The Azure spec
does not read the API version or deployment names from the environment: it
hard-codes API version `2025-04-01-preview` and the deployments `gpt-4.1-mini`
and `gpt-5-mini` (`packages/azure/src/integration.spec.ts`), so the recording
resource needs deployments with exactly those names.

Bedrock signs each request for the real regional endpoint and then sends it to
aimock, so recording needs `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (plus
`AWS_SESSION_TOKEN` for temporary credentials) in `.env`; `AWS_PROFILE` is
ignored. aimock records Bedrock through a local proxy
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
identifiers or endpoints. After aimock has written the recordings, stopping
the mock replaces every configured secret value in them with `[REDACTED]`.

The credential scan runs automatically at the end of `record-fixtures`, where
it checks both the configured secret values from `.env` and known key shapes
(`sk-…`, `AKIA…`, `AIza…`, bearer tokens, credential header names). It also
runs in `npx nx test testing`, but CI has no `.env`, so there it checks key
shapes only; a credential without a recognisable shape, such as a hex Azure
key, is caught only by the local scan. Review the diff.

## Replay is strict

Without `AIMOCK_RECORD=1`, specs replay with `strict: true`: a request that
matches no recorded fixture gets a 503 naming the missing test slug and file,
and the test fails. Replay needs no API keys. A changed prompt or request
shape therefore requires re-recording.
