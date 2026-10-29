---
title: 'Securing a Public Endpoint: Hashbrown React Docs'
meta:
  - name: description
    content: 'Verify identity, authorize a thread, and apply server policy before starting a streamed model response.'
---

# Securing a Public Endpoint

Who can start a reply? Let's make that boundary visible. We'll reject an anonymous request, load our own thread through a local demo session, and stream a real reply. Then we'll try a thread owned by someone else.

<hb-workbench lesson="public-endpoint">
</hb-workbench>

<img src="/video/docs/canonical-workbench-public-endpoint-react-result.png" alt="The React workbench shows the authorized conversation beside captured access checks, including anonymous and foreign-owner denials." width="1600" height="1000" loading="lazy" />

## Follow one request

1. Try the anonymous request. It returns **401** before any provider work.
2. Start a **local demo session** and load Lighthouse. The server resolves the session and authorizes the thread.
3. Send a message. The actual Hashbrown SDK receives a streamed OpenAI reply.
4. Try the foreign thread. It returns **404**, just like an unknown thread, without calling the provider.
5. Select the captured operation in the inspector to compare the statuses with the successful chat request.

The recording uses real provider output. The sign-in action is a local demonstration integration, not a production identity verifier. Its HttpOnly session cookie contains an unpredictable server-issued token; owner identity comes from the server's session lookup.

## Put the checks before the provider

The checked endpoint applies these rules in order:

| Boundary | Application rule |
| --- | --- |
| Identity | Resolve the existing session through a trusted verifier. Anonymous requests return 401. |
| Origin | Require the configured Origin on cookie-authenticated mutations. A different Origin returns 403. |
| Input | Bound the JSON body and validate the run envelope and supported text format. |
| Ownership | Read the thread through the verified owner. Unknown and foreign threads both return 404. |
| Admission | Apply the application's run policy before opening a stream. A rejected run returns 429. |
| Provider policy | Use server-owned instructions, model, credentials, and output limits. |

Origin checks protect cookie-authenticated browser mutations from cross-site submission. They do not establish identity. A client-supplied owner ID, thread ID, system instruction, or model response is not permission to access a record.

The demo session routes also require the exact local Origin for mutations and restrict the host to loopback. Supply your application's authentication integration before deploying this endpoint.

## Keep the integration small

`createThreadApp()` accepts four application integrations. Each has a separate responsibility:

<hb-code-example header="Application endpoint composition">

```ts
createThreadApp({
  origin,
  authenticate,
  allowRun,
  store,
  stream,
});
```

</hb-code-example>

`authenticate` returns a verified owner or null. `store` scopes every read and write to that owner and applies atomic version checks. `allowRun` decides whether this owner can begin another generation. `stream` receives the checked input and an abort signal.

The browser sends its current messages on each run. This text endpoint replaces client system and developer instructions with its server policy, removes client context/state/forwarded options, and rejects tools and resume requests. Keep the provider key and model configuration on the server.

The canonical wrapper also bounds text generation requests. The save format belongs to [server-owned threads](/docs/react/recipes/threads). Request validation and save validation serve different purposes: an incoming generation ends with a user message; a saved completed exchange ends with an assistant message.

## Handle the stream boundary

Before opening the stream, failures can return a regular HTTP status. After response headers have been sent, the endpoint emits a terminal `RUN_ERROR` for a provider failure or incomplete stream.

A browser disconnect aborts the provider signal. The endpoint disposes its iterator and respects response backpressure. Avoid logging raw provider errors, session cookies, or authorization headers in the inspector.

The **Access** view shows safe operation metadata: method, path, status, and source. The chat capture retains the actual request and decoded stream. A denied access check is an application operation; it is not a model response or a successful SDK generation.

## Deploy the application integrations

The local session and process-memory repository make this boundary easy to inspect. They are not durable authentication or storage. For deployment, connect your identity verifier and atomic database repository, use secure session cookies over HTTPS, and apply shared rate, concurrency, timeout, and spending limits across server instances.

Authorization also belongs on every browser tool or application action that changes data. A permitted generation does not grant permission to execute a plan.

Replay is read-only. Moving through the captured access checks does not mint a session, send a request, or repeat a write.

## Read the checked source

- [React client](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/react/src/ServerWorkbench.tsx) uses the actual framework chat SDK.
- [Shared controller](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-server-history.ts) records safe HTTP observations and guards async operations.
- [Canonical demo boundary](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/workbench-threads.ts) supplies local sessions and isolated lesson records.
- [Endpoint implementation](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/thread-app.ts) defines the identity, ownership, input, admission, and streaming checks.
- [Provider composition](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/server/thread-server.ts) demonstrates server-owned OpenAI configuration.

Continue with [Persist and Resume Threads](/docs/react/recipes/threads) to inspect explicit saves and conflict recovery. This text persistence format does not restore a durable agent checkpoint.

The [conversation workbench guide](/docs/react/start/workbench#inspect-and-replay) explains the inspector, keyboard controls, and read-only playback.
