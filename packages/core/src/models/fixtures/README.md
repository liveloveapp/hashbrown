`langgraph-tool-step-events.json` is an exact copy of
`cacheplane/b4run` commit `be1bbccdc`,
`packages/langgraph/test/fixtures/tool-step-events.json`.
SHA-256: `21b41944831950bba2a896e544dc3c23219b11deb4b25cf40ea9ebb231e3dda4`.

The producer test uses real `createAgent.streamEvents` v2 helper output and
MemorySaver checkpoint messages. Standard AG-UI frames are assembled from those
actual ToolMessages and deliberately follow CUSTOM events to cover late START.
The snapshot contains tool messages only; the consumer test adds their original
assistant declaration and user message to form valid canonical history.
