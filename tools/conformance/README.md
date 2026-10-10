# Conformance suites

These suites protect the published Hashbrown packages. They run the same
scenarios against an Angular host and a React host, so both frameworks keep
the same streaming, tool calling, structured output and generative UI
behaviour. They are internal test infrastructure, not an example to copy.

No model credentials are needed. Every model response comes from aimock or an
independent AG-UI endpoint started by the test.

## Layout

- `hosts/angular` and `hosts/react`: the runtime smoke hosts (Nx projects
  `runtime-smoke-angular` and `runtime-smoke-react`). Each page picks a
  scenario from the query string.
- `harness`: the shared Playwright driver, aimock worker, AG-UI helpers and
  event gate. Its own unit tests are the `*.spec.ts` files beside it.
- `specs`: the browser conformance specs. Each one runs once per framework.
- `provider`: native-provider checks. `native-ui.spec.ts` drives both hosts
  through the real OpenAI adapter and SSE transport with an aimock upstream.
  `routes.spec.ts` covers the Node and Worker route fixtures under Jest. A
  test-only `selectItem` tool verifies browser tool execution.
- `fixtures`: aimock fixtures used by the harness.

## Commands

```sh
npx nx build conformance            # type-check the suites
npx nx lint conformance
npx nx test conformance             # harness unit tests and provider routes
npx nx conformance-e2e conformance  # browser conformance specs
npx nx provider-e2e conformance     # native-provider checks
npx nx example-e2e conformance      # both, with one shared host lifecycle
```

The e2e targets build both hosts first. CI runs `example-e2e` through
`nx affected`.

## Ports and reports

| Suite          | Angular | React | Override                                                     |
| -------------- | ------- | ----- | ------------------------------------------------------------ |
| Conformance    | 4411    | 4412  | `RUNTIME_SMOKE_ANGULAR_PORT`, `RUNTIME_SMOKE_REACT_PORT`     |
| Provider       | 4421    | 4422  | `NATIVE_PROVIDER_ANGULAR_PORT`, `NATIVE_PROVIDER_REACT_PORT` |
| `serve-static` | 4311    | 4312  | `--port`                                                     |

Reports go to `test-results/conformance/{conformance,provider,all}` and
`playwright-report/conformance/{conformance,provider}`.

Standalone conformance uses a 15 second whole-test timeout. The provider and
combined runs use 30 seconds. Individual assertion deadlines are the same in
every run.
