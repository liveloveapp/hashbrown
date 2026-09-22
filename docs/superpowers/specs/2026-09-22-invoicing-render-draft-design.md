# Render the assistant's `render` arguments as they stream

## Problem and scope

B4 0.10.0 streams a tool call's arguments as several `TOOL_CALL_ARGS` deltas,
and the invoicing assistant's `render` call now reaches the browser as 100 to
500 deltas over one to five seconds. Nothing paints from them: the panel
renders each assistant message's `ui`, which is the render tool's nested echo,
and the middleware `after` hook holds that echo until the tool result lands.
Hashbrown surfaces a tool call on a message only when the client has a tool of
that name registered, so the server's `render` call is dropped from
`message.toolCalls`. Make the example paint the answer from the render
arguments while they stream, identically to the final answer, with no server
or library change.

## Design

**A display-only client tool.** The conversation registers a `render` tool
whose schema mirrors the server's input (`text`, `components`) using
hashbrown's streaming string, object and array builders, so `args` resolves
progressively. Its handler throws: the server executes `render` and its
`TOOL_CALL_RESULT` marks the call done before hashbrown would run a client
handler. B4 0.10.0 does not interpret tools the client advertises, so the
definition is inert server-side.

**A draft from the arguments.** For an assistant message that carries a
`render` call and has no `ui`, the panel renders the call's `args` through the
same kit components the final answer uses: `AssistantText` for the prose, and
`LedgerTable`, `TrendChart`, `AgingSummary` and `CustomerCard` for the leaves,
resolving IDs against the client's own snapshot exactly as those components
already do. `ReviewPayment` is an action, so the draft omits it; it appears
only in the server-validated answer. Optional keys the streaming parser has
not reached yet fall back to the kit's defaults (a null customer).

**Handing over to the final answer.** The echo arrives as a separate assistant
message with `ui`. The draft is shown only while no later assistant message in
the conversation has `ui`, so the validated answer replaces it and never sits
beside it. Because the components and props are the same, the swap is
invisible. A run that never validates UI keeps the last draft on screen until
the existing error alert appears.

## Alternatives

- Surface unregistered server tool calls from hashbrown core: a library-wide
  behaviour change for one example. Rejected.
- Drop the `after` hook's hold so the echo streams again: paints from the echo,
  not the arguments, and reopens the duplicate-answer trap. Rejected.

## Verification

Controlled-transport tests stream `TOOL_CALL_ARGS` deltas for a render call
behind a gate and assert the prose and a `LedgerTable` title are on screen
before `TOOL_CALL_END`; that the final `ui` replaces the draft with no
duplicate; that a `ReviewPayment` leaf draws nothing until the final answer.
The existing suite passes unchanged. A Chrome check against the running
example confirms the panel changes during the argument window.
