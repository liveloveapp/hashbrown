# Drop the render echo

## Problem and scope

The assistant's `render` tool validates the composed tree, then makes a second,
nested model call whose only job is to echo that tree as the assistant message
the browser renders, deep-equal to the canonical form, with one retry and a
`render_failed` error after that. The detour existed because the browser had
no other way to receive a server-validated tree. Measured in Chrome, the render
arguments finish streaming around 16 s into a run and the echo lands around
29 s, so the echo is roughly half the answer latency and a second model bill
per question, and it can fail after the answer was already valid.

Hashbrown now surfaces server-executed tool calls on the assistant message
(`serverToolCalls`, with progressively resolved `args` and an
`inProgress`/`executing`/`complete` status), and the invoicing client already
paints a draft from those arguments. Remove the echo: the browser renders the
answer from the render call itself. The write path, the review route and its
own echo are out of scope, as the generative UI spec's non-goals require.

## Design

**Server.** `render` validates the input through `validateUi`, which still
resolves every ID against the session snapshot and flips the `rendered`
marker the `after` hook reads, and returns `{ rendered: true }`. The nested
model, `renderUi`, its retry loop and the `structured_output_unavailable`
and `render_failed` errors are deleted. An invalid tree still throws
`invalid_ui: …`, which B4 delivers as an error tool result the model can act
on with one more `render`. The `after` hook is unchanged: it suppresses the
root model's closing message when a run validated UI and rejects the run when
none did.

**Client.** The conversation renders each assistant message's `render` call
through the existing draft renderer at every status. While `inProgress` or
`executing`, the arguments paint as they stream, minus `ReviewPayment`. Once
`complete` with a fulfilled result whose tool message is not an error, the
same renderer shows the final answer, now including `ReviewPayment`, since the
server validated exactly those arguments. A completed call whose result is an
error tool message renders nothing: the model either retries with a new call,
which becomes the message's last `render` call, or gives up, in which case the
`after` hook rejects the run and the existing alert appears. `message.ui` stays
in the loop only for the review route.

**Evals and docs.** The evals already score the render arguments, not the
echo. The harness test that asserted the echo's text in the token stream now
asserts the render result instead. The recorded tapes keep replaying: the
echo's recording simply goes unused. README, middleware comments and the
fixture-keying comment stop describing an echo.

## Alternatives

- Keep the echo and only add the draft: already shipped; leaves the latency
  and the second model call in place. Rejected.
- Return the canonical tree from `render` and render it through Hashbrown's
  kit renderer: the kit renderer is internal to `useUiChat`, and the draft
  renderer already draws every kit component from the same arguments.
  Rejected as extra surface for no gain.

## Verification

Server: `render` resolves to `{ rendered: true }` for a valid input and
rejects with `invalid_ui` for an unknown ID without constructing a model;
`renderUi` and its tests are gone. Client: a completed render call with a
fulfilled result renders the final answer including `ReviewPayment` with no
echo message; an error result renders nothing and a later successful call on
the same message renders; the draft tests still pass. Evals: the harness
tests pass against the committed tapes. Build, lint and test for the server,
contracts and React projects; the live browser check shows the answer settle
at the end of the arguments instead of seconds later.
