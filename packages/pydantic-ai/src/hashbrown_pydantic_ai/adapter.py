"""Preserve native AG-UI behavior while exposing typed terminal tool outcomes."""

from collections import defaultdict, deque
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from typing import Any, TypeVar

from ag_ui.core import AssistantMessage, BaseEvent, Message, ToolCallResultEvent, ToolMessage
from pydantic_ai import CustomEvent, RunCancelled
from pydantic_ai.messages import (
    FunctionToolResultEvent,
    ModelMessage,
    NativeToolCallPart,
    NativeToolReturnPart,
    OutputToolResultEvent,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.ui.ag_ui import DEFAULT_AG_UI_VERSION
from pydantic_ai.ui.ag_ui import AGUIAdapter as NativeAGUIAdapter
from pydantic_ai.ui.ag_ui import AGUIEventStream as NativeAGUIEventStream


@dataclass(kw_only=True)
class AGUIEvent(CustomEvent, name='hashbrown.ag_ui'):
    """Emit a standard AG-UI event via native ``await ctx.emit(...)``.

    The native adapter forwards ``to_payload()`` verbatim. This convenience
    wrapper adds no wire envelope, progress model or lifecycle semantics.
    """

    event: BaseEvent

    def to_payload(self) -> BaseEvent:
        """Return the original standard event for native AG-UI passthrough."""
        return self.event


_AgentDepsT = TypeVar('_AgentDepsT', contravariant=True)
_OutputDataT = TypeVar('_OutputDataT', covariant=True)

def _outcome(part: ToolReturnPart | NativeToolReturnPart, cancelled: bool = False) -> dict[str, Any]:
    """Translate an actual native return; never infer classification from its prose."""
    outcome = 'failure' if part.outcome == 'failed' else part.outcome
    if outcome == 'interrupted' and cancelled:
        outcome = 'cancelled'
    result: dict[str, Any] = {'v': 1, 'outcome': outcome}
    if outcome == 'failure':
        message = part.model_response_str(wrap_if_error=False).strip()
        result['error'] = {'message': message or 'Tool execution failed'}
    return result


def _enrich(value: Any, part: ToolReturnPart | NativeToolReturnPart, cancelled: bool = False) -> Any:
    """Copy native wire metadata without misrepresenting nonfailure as error."""
    update: dict[str, Any] = {'metadata': {**(value.metadata or {}), 'hashbrown.tool': _outcome(part, cancelled)}}
    if isinstance(value, ToolMessage) and part.outcome != 'failed':
        if value.error and not value.encrypted_value:
            # Pre-0.1.11 history only has `error` to retain denial/retry's native
            # fallback. Do not remove it or advertise a contradictory outcome.
            return value
        update['error'] = None
    return value.model_copy(update=update)


async def _enrich_result(events: AsyncIterator[BaseEvent], part: ToolReturnPart | NativeToolReturnPart, cancelled: bool) -> AsyncIterator[BaseEvent]:
    """Augment only the native result, leaving user-supplied extra events intact."""
    enriched = False
    async for value in events:
        if not enriched and isinstance(value, ToolCallResultEvent):
            enriched = True
            yield _enrich(value, part, cancelled)
        else:
            yield value


@dataclass
class AGUIEventStream(NativeAGUIEventStream[_AgentDepsT, _OutputDataT]):
    """Native event stream with optional ``metadata['hashbrown.tool']`` on results.

    Only a RunCancelled raised by this stream establishes cancellation provenance.
    Native interrupted history or ordinary exceptions retain their native meaning.
    """

    _hashbrown_cancelled: bool = field(default=False, init=False, repr=False)

    async def transform_stream(self, stream: AsyncIterator[Any], on_complete: Any = None, on_cancel: Any = None) -> AsyncIterator[BaseEvent]:
        """Observe first-party cancellation before native pending-result cleanup."""
        self._hashbrown_cancelled = False

        async def observed() -> AsyncIterator[Any]:
            try:
                async for event in stream:
                    yield event
            except RunCancelled:
                self._hashbrown_cancelled = True
                raise
            finally:
                close = getattr(stream, 'aclose', None)
                if close is not None:
                    await close()

        transformed = super().transform_stream(observed(), on_complete=on_complete, on_cancel=on_cancel)
        try:
            async for event in transformed:
                yield event
        finally:
            await transformed.aclose()

    async def handle_function_tool_result(self, event: FunctionToolResultEvent) -> AsyncIterator[BaseEvent]:
        """Augment function results while preserving native continuity events."""
        async for value in _enrich_result(super().handle_function_tool_result(event), event.part, self._hashbrown_cancelled):
            yield value

    async def handle_output_tool_result(self, event: OutputToolResultEvent) -> AsyncIterator[BaseEvent]:
        """Augment output-tool results through the native public result hook."""
        async for value in _enrich_result(super().handle_output_tool_result(event), event.part, self._hashbrown_cancelled):
            yield value

    async def handle_builtin_tool_return(self, part: NativeToolReturnPart) -> AsyncIterator[BaseEvent]:
        """Keep native builtin ID translation and add the actual return outcome."""
        async for value in _enrich_result(super().handle_builtin_tool_return(part), part, self._hashbrown_cancelled):
            yield value


class AGUIAdapter(NativeAGUIAdapter[_AgentDepsT, _OutputDataT]):
    """Drop-in native AG-UI adapter adding neutral terminal result metadata.

    All agent configuration, frontend tools, request loading and sanitization remain
    inherited. Client-controlled metadata is never promoted to backend tool state.
    """

    def build_event_stream(self) -> AGUIEventStream[_AgentDepsT, _OutputDataT]:
        """Build the compatibility stream with all native public stream options."""
        return AGUIEventStream(
            self.run_input,
            accept=self.accept,
            ag_ui_version=self.ag_ui_version,
            include_usage=self.include_usage,
            manage_system_prompt=self.manage_system_prompt,
            preserve_file_data=self.preserve_file_data,
        )

    @classmethod
    def dump_messages(cls, messages: Sequence[ModelMessage], *, ag_ui_version: str = DEFAULT_AG_UI_VERSION, preserve_file_data: bool = False) -> list[Message]:
        """Enrich native history, retaining superclass IDs and security semantics.

        Builtin IDs are learned from the superclass's actual assistant calls rather
        than reconstructed using private ID-prefix helpers. No cancellation is
        inferred from interrupted history without live cancellation provenance.
        """
        result: list[Message] = []
        for message in messages:
            dumped = super().dump_messages([message], ag_ui_version=ag_ui_version, preserve_file_data=preserve_file_data)
            calls = [part for part in message.parts if isinstance(part, (ToolCallPart, NativeToolCallPart))]
            wire_calls = [call for value in dumped if isinstance(value, AssistantMessage) for call in value.tool_calls or ()]
            returns: dict[str, deque[ToolReturnPart | NativeToolReturnPart]] = defaultdict(deque)
            builtin_returns = {part.tool_call_id: part for part in message.parts if isinstance(part, NativeToolReturnPart)}
            for part, call in zip(calls, wire_calls):
                if isinstance(part, NativeToolCallPart) and part.tool_call_id in builtin_returns:
                    returns[call.id].append(builtin_returns[part.tool_call_id])
            for part in message.parts:
                if isinstance(part, ToolReturnPart):
                    returns[part.tool_call_id].append(part)
            for value in dumped:
                if isinstance(value, ToolMessage) and returns[value.tool_call_id]:
                    value = _enrich(value, returns[value.tool_call_id].popleft())
                result.append(value)
        return result
