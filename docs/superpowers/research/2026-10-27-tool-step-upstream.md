# Tool-step UX: landed work and upstream AG-UI

> Historical review, October 27. UX helpers (#805), subagents (#812), and
> OpenAI/Azure code execution (#824) have since merged. See the
> [current closeout](../research/2026-10-29-tool-display-closeout.md) for delivered
> and outstanding work. Upstream issue statuses below were checked on October 27.

Reviewed 2026-10-27 against Hashbrown main `e5af35fe`, installed
`@ag-ui/core@1.0.3`, and the linked upstream repository/docs.

## What upstream means

[AG-UI](https://docs.ag-ui.com/introduction) is the Agent User Interaction
Protocol: the common event stream between an agent backend and a frontend.
Hashbrown consumes that protocol. B4 produces it. CopilotKit is another
consumer/integration, not the protocol itself.

“Upstream” in slice 6 means bringing the shared tool-display profile's general
requirements to [ag-ui-protocol/ag-ui](https://github.com/ag-ui-protocol/ag-ui),
so integrations can eventually agree on standard names and behavior. It does
not mean adding an upstream renderer or a new dependency to Hashbrown. The
current helpers work on existing public Hashbrown state and need no protocol
change or upstream adoption.

## Already landed

| Work | Merged PR |
|---|---|
| Shared step reader, public call/answer fields, OpenAI/Azure search | [Hashbrown #691](https://github.com/liveloveapp/hashbrown/pull/691) |
| Shared fixture conformance and metadata identity cleanup | [Hashbrown #708](https://github.com/liveloveapp/hashbrown/pull/708) |
| Anthropic provider steps/native replay | [Hashbrown #715](https://github.com/liveloveapp/hashbrown/pull/715) |
| Google provider steps, native replay and search attribution | [Hashbrown #730](https://github.com/liveloveapp/hashbrown/pull/730) |
| Bedrock provider steps/native replay | [Hashbrown #736](https://github.com/liveloveapp/hashbrown/pull/736) |
| Plain LangGraph helper guidance and validation | [Hashbrown #743](https://github.com/liveloveapp/hashbrown/pull/743) |
| B4 provider built-ins, enabling API and Google retaining transport | [B4 #1114](https://github.com/cacheplane/b4run/pull/1114) |

Hashbrown also already has activities, stable message ids and `groupTurns`.
The original slice-1 plan's unchecked boxes and the early memory note are
historical, not a reliable inventory of today's missing code.

## This PR

Add pure public helpers for labels, consecutive successful call groups, turn
summaries, source collection, per-answer attribution collection, compact
duration formatting, and the 300 ms no-flash / 1 s tick policy. React and Angular
re-export the same core functions and neutral types. Apps still own components,
clocks and rendering.

There are two different meanings of attribution:

- **Provider answer attribution** is content such as Google's Search Suggestions.
  The helper keeps it verbatim and associated with its assistant message.
- **Subagent output attribution** is provenance: which invocation produced a
  message or event. It uses `subagentRunId` and belongs to the next slice.

The user explicitly selected “UX helpers first; subagents next.” File search
remains deferred. This PR does not add subagent lifecycle state, publish an
upstream proposal, or write release notes.

## Current upstream status and gaps

- [#2146](https://github.com/ag-ui-protocol/ag-ui/issues/2146), server-decided
  tool-call display names, remains open. It discusses separate live and result
  wording. Hashbrown already consumes producer labels through the versioned
  profile; these helpers add client wording and grouping without changing it.
- [Discussion #2161](https://github.com/ag-ui-protocol/ag-ui/discussions/2161)
  gathers protocol direction, including whether tool display names belong in
  core or an integration convention. It is a discussion, not an accepted
  field or a blocking implementation dependency.
- Installed AG-UI 1.0.3 still has no typed `error` on `ToolCallResultEvent`.
  The shared profile's settled outcome and readable failure remain necessary.
- Universal provider-tool classification and citation/required-attribution
  interchange still need a standard profile. The open
  [ADK grounding/citation issue #2862](https://github.com/ag-ui-protocol/ag-ui/issues/2862)
  is an integration-specific example, not a general replacement for
  `b4.answer`. The old design's #646 reference did not resolve as an issue on
  this review date; do not present it as a verified open proposal.
- [Standard subagent events](https://docs.ag-ui.com/concepts/subagents) already
  exist in the installed SDK: STARTED, FINISHED and ERROR, plus event/message
  provenance. Hashbrown's next slice must consume those existing semantics,
  including concurrent owners, suspension/resume and snapshot provenance.
  It should not invent a second subagent wire contract.

## Future upstream contribution

With explicit user approval, contribute the tested profile and fixture cases
to the existing discussions: streamed labels, truthful failure/denial/cancel
outcomes, provider execution identity, durable citations and required provider
attribution. Keep server/consumer compatibility and ordering cases concrete.

No issue, comment or pull request has been filed upstream from this work.
Hashbrown continues to read the current versioned metadata/CUSTOM profile;
future standard fields can map into its neutral view without forcing apps to
adopt vendor type names.
