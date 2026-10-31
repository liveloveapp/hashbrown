# hashbrown-pydantic-ai

Optional AG-UI compatibility for Pydantic AI. Substitute the public adapter at
an existing `dispatch_request` boundary:

```python
from hashbrown_pydantic_ai import AGUIAdapter

response = await AGUIAdapter.dispatch_request(request, agent=agent)
```

The adapter inherits Pydantic AI's frontend tools, deferred execution, approval
resume, request sanitization and configuration. It adds no executors or storage.
It preserves native results and continuity events while adding this optional
terminal record to tool result events and dumped tool messages:

```json
{"hashbrown.tool": {"v": 1, "outcome": "failure", "error": {"message": "Tool execution failed"}}}
```

The record is in `metadata`; outcomes are `success`, `failure`, `denied`,
`cancelled`, `interrupted` and `retried`. Classification uses actual native
return outcomes. Failure detail has a nonempty fallback. Only a real native
`RunCancelled` observed during a live stream turns interrupted returns into
`cancelled`. Dumped interrupted history stays `interrupted`; this package does
not invent cancellation provenance or backend recovery from client JSON.
Client-provided metadata is never trusted as backend execution state.

Requires Python 3.11+, Pydantic AI 2.64–2.x, AG-UI 1.x and Starlette.
Version 0.1.0 is qualified against the repository's exact pinned Pydantic AI
2.64.0 / AG-UI 1.0.0 host. Wider allowed dependency versions are not individually
qualified. Native baseline evidence remains separate from adapter qualification.

From the repository, `npx nx build pydantic-ai` builds wheel and sdist;
`npx nx test pydantic-ai` runs tests against an isolated installed wheel;
`npx nx lint pydantic-ai` checks Python syntax without additional dependencies.

For standard progress events from a tool, use Pydantic AI's native context
emission with the convenience wrapper:

```python
from ag_ui.core import ActivitySnapshotEvent
from hashbrown_pydantic_ai import AGUIEvent

await ctx.emit(AGUIEvent(event=ActivitySnapshotEvent(
    message_id="progress", activity_type="progress", content={"done": 3}
)))
```

`AGUIEvent` is a native `CustomEvent` whose `to_payload()` returns the standard
event. Native AG-UI forwards it unchanged; it adds no custom wire envelope.
The same mechanism supports standard steps, state events and activity deltas.

Canonical history uses `ToolMessage.error` only for actual failures. Denied and
retried results keep their readable native content and encrypted continuity
marker while leaving `error` unset. Neutral outcome compatibility is qualified
with AG-UI 1.0. If `ag_ui_version` is explicitly set below 0.1.11, native history
has no encrypted outcome carrier: for denied/retried results this adapter retains
the native error fallback and omits neutral metadata rather than silently losing
native continuity. Such legacy histories reload as failed, matching Pydantic AI's
native documented fallback; use the supported AG-UI 1.0 setting for typed outcomes.
