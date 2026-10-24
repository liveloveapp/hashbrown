# ATC optional b4.run chat backend

Status: approved by the user on 2026-10-23; source implementation is in place.

The original published-package compatibility gate failed. Local b4.run fixes
at `ef984f37c` now pass the runtime and browser integration checks. See
`../reports/2026-10-23-atc-b4run-compatibility.md` for the original evidence and
implementation follow-up. Pins now use registry release 0.15.1, which still lacks the output-cap fix.
Shared-store tests pass against disposable local Postgres; complete agent and
generated-artifact Postgres validation remain blocked on a compatible release.
Hosted configuration and smoke tests are still required. The user is handling releases separately.

## Purpose and agreed scope

Show how the same Hashbrown React and Angular application can use either its
OpenAI provider directly or a b4.run agent. Keep the direct provider example
readable and retain it as the default locally and in the hosted demo.

- Select the backend using `ATC_CHAT_BACKEND=openai|b4run`; absent means `openai`.
- Keep `/api/run` as the browser-facing chat endpoint for both backends.
- Keep the current components, browser tool handlers, card selection, and streaming UI.
- Keep filters, TypeSafe decisions, aircraft data, and chart endpoints on their current paths.
- Keep chat anonymous. A reload starts a new conversation; do not add history restoration.
- Do not add a UI backend selector, server tools, memory, subagents, or approvals.

An unknown backend setting fails configuration validation. A selected b4.run
backend that cannot start reports its configuration error; it does not silently
fall back to OpenAI and hide which integration is running.

## Architecture

The browser continues using Hashbrown's own transport and chat runtime. This
example does not replace either framework's Hashbrown hooks with `B4HttpAgent`.

`/api/run` dispatches to one of two handlers selected by server configuration:

1. OpenAI: the existing `HashbrownOpenAI.stream.text` implementation.
2. b4.run: a public endpoint adapter that normalizes the request and invokes a
   b4.run AG-UI `agent()` route, passing its event stream back to Hashbrown.

Share the pure ATC request policy between those handlers: body and message
limits, tool definitions, prompt filtering, and response schema selection.
Keep provider-specific model settings and protocol translation in their
respective handlers. Readers should still be able to locate a direct
`HashbrownOpenAI` call and a small b4.run agent descriptor.

The adapter is the enforced ingress for b4.run chat, before b4.run's envelope
validation. Do not expose a second public execution path that bypasses it.
Runtime thread and administrative endpoints are not part of the demo's public API.

## Browser tool round trip

The adapter retains recognized tool names supplied by the browser, removes
unknown names and duplicates, and substitutes definitions from
`ATC_TOOL_DEFINITIONS`. A browser cannot change a tool's description or argument
schema. Browser tool results remain untrusted input, as they are today.

Enable client tools only on the ATC agent route. b4.run internally calls them
as `client_<name>` and emits their original names to Hashbrown. Hashbrown executes
the existing browser handler against its live store, then sends the tool result
in the next request with the same thread identity. b4.run matches the pending
call and resumes the agent. Parallel calls must all settle before the agent
continues; completed browser actions must not be replayed by transport retries.

Do not preload the complete aircraft store into the server. Only results of
tools that the model calls travel back, as in the current example.

Configure the agent with ATC's server-owned prompt, model, output cap, and
bounded execution. Remove client system/developer messages before forwarding.
Expose only the ATC browser tool set; exclude b4.run default capabilities that
would add workspace, shell, memory, planning, or delegation tools.

## Pinned response schemas

Reuse the existing `RESPONSE_SCHEMA_ALLOWLIST`: Markdown plus each non-empty
subset of the four cards in declared order, 15 schemas total.

For every request, including browser tool continuations:

1. Read `forwardedProps.hashbrown.responseSchema` from the Hashbrown request.
2. If it matches an allowlisted schema, use the server-owned matching object.
3. If present but unrecognized, use `FULL_RESPONSE_SCHEMA`, preserving the current fallback.
4. If absent, omit structured output, preserving the existing free-text behavior.
5. For b4.run, write the selected schema to `forwardedProps.responseSchema`.
   Construct this object explicitly; do not spread other client additions into it.

Allow only the `responseSchema` forwarded key on the b4.run route. Its normal
route middleware is too late to pin these fields: the inspected runtime reads
schema and tool definitions from the original request before invoking middleware.

The same selected component set must constrain the final answer after browser
tool execution. Verify that Hashbrown retains its selected schema across its
continuation requests and b4.run applies it to the resumed agent. Do not assume
that a valid schema on the initial request proves continuation compatibility.

## Anonymous lifecycle and storage

For the b4.run path, use an anonymous visitor identity carried by a server-issued
HttpOnly, SameSite cookie and bind thread access to that identity. Keep the
conversation identity in page memory so reload creates a new conversation.
Both backends retain the current visible session behavior.

b4.run needs checkpoints and pending browser tool records even without history
restoration. Local development may use its Node SQLite defaults. A serverless
or multi-instance deployment requires shared checkpoint, thread, and client
tool stores; process memory or local ephemeral files are insufficient.

Set the client tool TTL explicitly and configure cleanup of settled records.
Use bounded retention for abandoned anonymous conversations. The supported
cleanup mechanism and exact retention values must be established in the
compatibility investigation before implementation planning is finalized.

Stopping a stream must cancel upstream work. Stopping while a browser call is
parked must leave the conversation able to accept a later user message through
b4.run's supported abandonment behavior. Do not invent synthetic tool replies
in the adapter or bypass b4.run's pending-call matching.

## Compatibility investigation before implementation

The local `~/repos/b4run` working checkout is an older Dawn branch. Research for
this proposal used that repository's local `main` source without modifying it.
Source support is not proof that Hashbrown's installed package artifacts support
the same contract. Root dependencies currently mix b4.run CLI/core/storage
0.14.0 with SDK 0.15.0.

First verify a coherent supported package set against the published artifacts
that implementation would use. Confirm browser tool parking/resumption,
structured output on resumed runs, AG-UI event compatibility, disabling default
tools, model limits, cancellation, anonymous thread ownership, cleanup, and the
supported runtime embedding/deployment interface. Any dependency additions
require user approval under repository instructions.

Prefer invoking the supported runtime in the ATC server process. If that
interface cannot support the adapter, document the concrete limitation and
propose a private b4.run service behind `/api/run` before changing the design.
Avoid importing undocumented CLI internals or patching generated runtime code.

The default OpenAI deployment must not require b4.run runtime storage or secrets.
Keep its existing Vercel packaging behavior. Opt-in deployment packaging is
conditional on selecting b4.run and passing the compatibility investigation.

## Verification and documentation

Write failing tests first, using top-level `test(...)` and arrange/act/assert.

- Exercise both backends with the same request policy tests: tool tampering,
  unknown tools, client prompts, schema narrowing, invalid schema fallback,
  missing schema, and request limits.
- Prove a browser query, a map action, and a streamed card through the actual
  b4.run runtime with deterministic provider responses.
- Cover parallel tool results, retries, tool failures, cancellation during model
  output and browser execution, new messages over abandoned calls, and a schema
  retained across multiple continuations.
- Verify visitor ownership prevents cross-session thread access and public
  requests cannot bypass the adapter.
- Exercise the shared behavior through both Angular and React. Keep live model
  evals explicit; run the existing required evals if their prompts change.
- Run build, test, and lint for every affected package, plus ATC packaging and
  affected end-to-end/type checks. Report failures and warnings.

Document the two architectures, the configuration setting, and opt-in b4.run
storage/setup requirements in ATC's README. Explain that both render with
Hashbrown while only the direct backend calls `HashbrownOpenAI` for chat.

## Next step

Review this design, then create an implementation plan beginning with the
compatibility investigation. It must resolve the runtime packaging and cleanup
questions above before authorizing the full migration work.
