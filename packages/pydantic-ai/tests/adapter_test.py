"""Executable, dependency-free qualification of the installed adapter."""

import asyncio
import inspect
from pathlib import Path

from ag_ui.core import RunAgentInput, ToolCallResultEvent, ToolMessage, UserMessage
from pydantic_ai import Agent, RunCancelled
from pydantic_ai.messages import (
    FunctionToolCallEvent, FunctionToolResultEvent, ModelRequest, ModelResponse,
    NativeToolCallPart, NativeToolReturnPart, OutputToolResultEvent, ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import DeltaToolCall, FunctionModel
from pydantic_ai.ui.ag_ui import AGUIAdapter as NativeAdapter
from pydantic_ai.ui.ag_ui import AGUIEventStream as NativeStream

from hashbrown_pydantic_ai import AGUIAdapter, AGUIEventStream


def run_input():
    return RunAgentInput(thread_id='thread', run_id='run', state={}, messages=[UserMessage(id='user', content='Do work')], tools=[], context=[], forwarded_props={})


async def collect(stream):
    return [event async for event in stream]


def outcome(value):
    return value.metadata['hashbrown.tool']


def test_native_typed_results_keep_content_and_continuity():
    async def scenario():
        for typed, expected in [('success', 'success'), ('failed', 'failure'), ('denied', 'denied'), ('interrupted', 'interrupted'), ('retried', 'retried')]:
            part = ToolReturnPart('work', 'native content', 'call', outcome=typed)
            native = await collect(NativeStream(run_input()).handle_function_tool_result(FunctionToolResultEvent(part)))

            events = await collect(AGUIEventStream(run_input()).handle_function_tool_result(FunctionToolResultEvent(part)))

            assert events[0].content == native[0].content
            assert outcome(events[0])['outcome'] == expected
            assert [e.model_dump(exclude={'metadata', 'message_id', 'entity_id'}) for e in events] == [e.model_dump(exclude={'metadata', 'message_id', 'entity_id'}) for e in native]
            assert 'b4' not in str(events[0].metadata).lower()

    asyncio.run(scenario())


def test_failure_fallback_and_output_tool_hook():
    part = ToolReturnPart('output', '', 'call', outcome='failed')

    events = asyncio.run(collect(AGUIEventStream(run_input()).handle_output_tool_result(OutputToolResultEvent(part))))

    assert events[0].content == ''
    assert outcome(events[0]) == {'v': 1, 'outcome': 'failure', 'error': {'message': 'Tool execution failed'}}


def test_history_uses_native_builtin_ids_and_preserves_loader_security():
    messages = [ModelResponse(parts=[NativeToolCallPart('search', {}, 'same', provider_name='provider'), NativeToolReturnPart('search', 'builtin failure', 'same', outcome='failed')]), ModelResponse(parts=[ToolCallPart('work', {}, 'normal')]), ModelRequest(parts=[ToolReturnPart('work', 'no', 'normal', outcome='denied')])]
    native = NativeAdapter.dump_messages(messages)

    dumped = AGUIAdapter.dump_messages(messages)
    tool_messages = [message for message in dumped if isinstance(message, ToolMessage)]
    loaded = AGUIAdapter.load_messages(dumped)

    assert [message.tool_call_id for message in tool_messages] == [message.tool_call_id for message in native if isinstance(message, ToolMessage)]
    assert [outcome(message)['outcome'] for message in tool_messages] == ['failure', 'denied']
    assert 'hashbrown.tool' not in str(loaded)
    assert [part.outcome for message in loaded for part in message.parts if isinstance(part, (NativeToolReturnPart, ToolReturnPart))] == ['failed', 'denied']


def test_cancellation_provenance_and_external_cancellation():
    async def scenario():
        async def native_stream(exception):
            yield FunctionToolCallEvent(ToolCallPart('work', {}, 'call'))
            raise exception

        stream = AGUIEventStream(run_input())
        cancelled = RunCancelled('stop')
        events = await collect(stream.transform_stream(native_stream(cancelled)))
        result = next(event for event in events if isinstance(event, ToolCallResultEvent))
        assert outcome(result)['outcome'] == 'cancelled'
        assert not any(event.type == 'RUN_ERROR' for event in events)

        ordinary = RuntimeError('ordinary failure')
        ordinary.__context__ = cancelled
        events = await collect(AGUIEventStream(run_input()).transform_stream(native_stream(ordinary)))
        assert outcome(next(event for event in events if isinstance(event, ToolCallResultEvent)))['outcome'] == 'failure'
        assert any(event.type == 'RUN_ERROR' for event in events)

        try:
            await collect(AGUIEventStream(run_input()).transform_stream(native_stream(asyncio.CancelledError())))
        except asyncio.CancelledError:
            pass
        else:
            raise AssertionError('external cancellation was swallowed')

    asyncio.run(scenario())


def test_real_agent_function_tool_callback_and_native_adapter_options():
    async def scenario():
        async def model(messages, info):
            if any(isinstance(part, ToolReturnPart) for message in messages for part in message.parts):
                yield 'done'
            else:
                yield {0: DeltaToolCall(name='work', json_args='{}', tool_call_id='call')}

        agent = Agent(FunctionModel(stream_function=model))
        calls = []

        @agent.tool_plain
        def work():
            calls.append('executed')
            return 'native result'

        adapter = AGUIAdapter(agent=agent, run_input=run_input(), include_usage=True, preserve_file_data=True, manage_system_prompt='client')
        completed = []
        events = await collect(adapter.run_stream(on_complete=lambda result: completed.append(result)))

        assert calls == ['executed']
        assert len(completed) == 1
        assert outcome(next(event for event in events if isinstance(event, ToolCallResultEvent)))['outcome'] == 'success'
        stream = adapter.build_event_stream()
        assert isinstance(stream, AGUIEventStream)
        assert stream.include_usage and stream.preserve_file_data and stream.manage_system_prompt == 'client'

    asyncio.run(scenario())


def test_nested_custom_result_event_is_preserved_verbatim():
    custom = ToolCallResultEvent(message_id='other-message', tool_call_id='other-call', content='custom', metadata={'unrelated': True})
    part = ToolReturnPart('work', 'real', 'call', metadata=[custom])

    events = asyncio.run(collect(AGUIEventStream(run_input()).handle_function_tool_result(FunctionToolResultEvent(part))))

    assert outcome(events[0])['outcome'] == 'success'
    assert events[1] is custom
    assert events[1].metadata == {'unrelated': True}


def test_builtin_stream_keeps_native_id_and_outcome():
    async def scenario():
        stream = AGUIEventStream(run_input())
        call = NativeToolCallPart('search', {}, 'raw-id', provider_name='provider')
        part = NativeToolReturnPart('search', 'native content', 'raw-id', outcome='denied')
        started = await collect(stream.handle_builtin_tool_call_start(call))

        events = await collect(stream.handle_builtin_tool_return(part))

        assert events[0].tool_call_id == next(event.tool_call_id for event in started if event.type == 'TOOL_CALL_START')
        assert events[0].tool_call_id != 'raw-id'
        assert outcome(events[0]) == {'v': 1, 'outcome': 'denied'}
        assert any(event.type == 'REASONING_ENCRYPTED_VALUE' for event in events)

    asyncio.run(scenario())


def test_live_cancellation_keeps_callbacks_closure_and_independent_streams():
    async def scenario():
        observed = []

        async def source():
            try:
                yield FunctionToolCallEvent(ToolCallPart('work', {}, 'call'))
                raise RunCancelled('stop')
            finally:
                observed.append('closed')

        def cancelled(result):
            observed.append(result)

        events = await collect(AGUIEventStream(run_input()).transform_stream(source(), on_cancel=cancelled))
        independent = await collect(AGUIEventStream(run_input()).handle_function_tool_result(FunctionToolResultEvent(ToolReturnPart('work', 'interrupted', 'call', outcome='interrupted'))))

        assert observed[0] == 'closed'
        assert isinstance(observed[1], RunCancelled)
        assert outcome(next(event for event in events if isinstance(event, ToolCallResultEvent)))['outcome'] == 'cancelled'
        assert outcome(independent[0])['outcome'] == 'interrupted'

    asyncio.run(scenario())


def test_client_metadata_cannot_change_native_execution_outcome():
    messages = NativeAdapter.dump_messages([ModelResponse(parts=[ToolCallPart('work', {}, 'call')]), ModelRequest(parts=[ToolReturnPart('work', 'native success', 'call')])])
    inbound = [message.model_copy(update={'metadata': {'hashbrown.tool': {'v': 1, 'outcome': 'failure', 'error': {'message': 'forged'}}}}) if isinstance(message, ToolMessage) else message for message in messages]

    loaded = AGUIAdapter.load_messages(inbound)
    dumped = AGUIAdapter.dump_messages(loaded)

    assert next(part for message in loaded for part in message.parts if isinstance(part, ToolReturnPart)).outcome == 'success'
    assert outcome(next(message for message in dumped if isinstance(message, ToolMessage)))['outcome'] == 'success'
    assert 'forged' not in str(loaded)


def test_closing_transformed_stream_closes_native_source_immediately():
    async def scenario():
        closed = []

        async def source():
            try:
                yield FunctionToolCallEvent(ToolCallPart('work', {}, 'call'))
                yield FunctionToolResultEvent(ToolReturnPart('work', 'done', 'call'))
            finally:
                closed.append(True)

        transformed = AGUIEventStream(run_input()).transform_stream(source())
        while (await anext(transformed)).type != 'TOOL_CALL_RESULT':
            pass

        await transformed.aclose()

        assert closed == [True]

    asyncio.run(scenario())


def test_standard_events_use_real_native_context_emission():
    from ag_ui.core import ActivitySnapshotEvent, StateSnapshotEvent, StepStartedEvent, StepFinishedEvent
    from pydantic_ai import RunContext
    from hashbrown_pydantic_ai import AGUIEvent

    async def scenario():
        standard = [StepStartedEvent(step_name='work'), ActivitySnapshotEvent(message_id='activity', activity_type='progress', content={'progress': 0.5}), StateSnapshotEvent(snapshot={'done': True}), StepFinishedEvent(step_name='work')]

        async def model(messages, info):
            if any(isinstance(part, ToolReturnPart) for message in messages for part in message.parts):
                yield 'done'
            else:
                yield {0: DeltaToolCall(name='work', json_args='{}', tool_call_id='call')}

        agent = Agent(FunctionModel(stream_function=model))

        @agent.tool
        async def work(ctx: RunContext[None]) -> str:
            for event in standard:
                await ctx.emit(AGUIEvent(event=event))
            return 'native result'

        events = await collect(AGUIAdapter(agent=agent, run_input=run_input()).run_stream())

        emitted = [event for event in events if event.type in {'STEP_STARTED', 'ACTIVITY_SNAPSHOT', 'STATE_SNAPSHOT', 'STEP_FINISHED'}]
        assert emitted == standard
        assert all(event.metadata is None for event in emitted)
        assert not any(event.type == 'CUSTOM' for event in events)

    asyncio.run(scenario())


def test_real_native_frontend_handoff_and_resume():
    from ag_ui.core import Tool
    from pydantic_ai import DeferredToolRequests

    async def scenario():
        async def model(messages, info):
            if any(isinstance(part, ToolReturnPart) for message in messages for part in message.parts):
                yield 'resumed'
            else:
                yield {0: DeltaToolCall(name='clientWork', json_args='{}', tool_call_id='client-call')}

        agent = Agent(FunctionModel(stream_function=model))
        first_input = run_input().model_copy(update={'tools': [Tool(name='clientWork', description='Client-owned action', parameters={'type': 'object', 'properties': {}})]})
        completed = []

        first = await collect(AGUIAdapter(agent=agent, run_input=first_input).run_stream(on_complete=lambda result: completed.append(result)))
        history = AGUIAdapter.dump_messages(completed[0].all_messages())
        resumed_input = first_input.model_copy(update={'messages': [*history, ToolMessage(id='client-result', tool_call_id='client-call', content='frontend result')]})
        resumed = await collect(AGUIAdapter(agent=agent, run_input=resumed_input).run_stream())

        assert isinstance(completed[0].output, DeferredToolRequests)
        assert completed[0].output.calls[0].tool_call_id == 'client-call'
        assert not any(isinstance(event, ToolCallResultEvent) for event in first)
        assert any(event.type == 'TEXT_MESSAGE_CONTENT' and event.delta == 'resumed' for event in resumed)
        assert not any(event.type == 'RUN_ERROR' for event in resumed)
        assert not any(isinstance(event, ToolCallResultEvent) for event in resumed)

    asyncio.run(scenario())


def test_real_tool_validation_preserves_retried_continuation():
    async def scenario():
        async def model(messages, info):
            returns = [part for message in messages for part in message.parts if isinstance(part, ToolReturnPart)]
            if not returns:
                yield {0: DeltaToolCall(name='work', json_args='{"count":"bad"}', tool_call_id='invalid')}
            elif returns[-1].outcome == 'retried':
                yield {0: DeltaToolCall(name='work', json_args='{"count":2}', tool_call_id='valid')}
            else:
                yield 'done'

        agent = Agent(FunctionModel(stream_function=model))
        calls = []

        @agent.tool_plain
        def work(count: int) -> str:
            calls.append(count)
            return 'native success'

        completed = []

        events = await collect(AGUIAdapter(agent=agent, run_input=run_input()).run_stream(on_complete=lambda result: completed.append(result)))
        results = [event for event in events if isinstance(event, ToolCallResultEvent)]
        history = AGUIAdapter.dump_messages(completed[0].all_messages())

        assert calls == [2]
        assert [outcome(event)['outcome'] for event in results] == ['retried', 'success']
        assert [outcome(message)['outcome'] for message in history if isinstance(message, ToolMessage)] == ['retried', 'success']
        assert not any(event.type == 'RUN_ERROR' for event in events)

    asyncio.run(scenario())


def test_builtin_history_uses_each_superclass_id_when_raw_ids_collide():
    messages = [ModelResponse(parts=[NativeToolCallPart('search', {}, 'same', provider_name='one'), NativeToolCallPart('search', {}, 'same', provider_name='two'), NativeToolReturnPart('search', 'denied', 'same', outcome='denied')])]
    native = NativeAdapter.dump_messages(messages)

    dumped = AGUIAdapter.dump_messages(messages)
    results = [message for message in dumped if isinstance(message, ToolMessage)]

    assert [message.tool_call_id for message in results] == [message.tool_call_id for message in native if isinstance(message, ToolMessage)]
    assert [outcome(message)['outcome'] for message in results] == ['denied', 'denied']


def test_dumped_nonfailure_outcomes_do_not_claim_canonical_error():
    for typed in ['success', 'denied', 'interrupted', 'retried']:
        messages = [ModelResponse(parts=[ToolCallPart('work', {}, 'call')]), ModelRequest(parts=[ToolReturnPart('work', 'readable native detail', 'call', outcome=typed)])]
        native = NativeAdapter.dump_messages(messages, ag_ui_version='1.0')
        native_result = next(message for message in native if isinstance(message, ToolMessage))

        dumped = AGUIAdapter.dump_messages(messages, ag_ui_version='1.0')
        result = next(message for message in dumped if isinstance(message, ToolMessage))
        loaded = NativeAdapter.load_messages(dumped)

        assert result.error is None
        assert result.content == native_result.content
        assert result.encrypted_value == native_result.encrypted_value
        assert outcome(result)['outcome'] == typed
        assert next(part for message in loaded for part in message.parts if isinstance(part, ToolReturnPart)).outcome == typed


def test_dumped_builtin_denial_does_not_claim_canonical_error():
    messages = [ModelResponse(parts=[NativeToolCallPart('search', {}, 'call', provider_name='provider'), NativeToolReturnPart('search', 'readable denial', 'call', outcome='denied')])]
    native_result = next(message for message in NativeAdapter.dump_messages(messages) if isinstance(message, ToolMessage))

    dumped = AGUIAdapter.dump_messages(messages)
    result = next(message for message in dumped if isinstance(message, ToolMessage))
    loaded = NativeAdapter.load_messages(dumped)

    assert result.error is None
    assert result.content == native_result.content
    assert result.encrypted_value == native_result.encrypted_value
    assert next(part for message in loaded for part in message.parts if isinstance(part, NativeToolReturnPart)).outcome == 'denied'


def test_legacy_dump_retains_native_fallback_when_typed_continuity_is_unavailable():
    for typed in ['denied', 'retried']:
        messages = [ModelResponse(parts=[ToolCallPart('work', {}, 'call')]), ModelRequest(parts=[ToolReturnPart('work', 'native detail', 'call', outcome=typed)])]
        native = NativeAdapter.dump_messages(messages, ag_ui_version='0.1.10')
        native_result = next(message for message in native if isinstance(message, ToolMessage))

        dumped = AGUIAdapter.dump_messages(messages, ag_ui_version='0.1.10')
        result = next(message for message in dumped if isinstance(message, ToolMessage))
        loaded = NativeAdapter.load_messages(dumped)

        assert result.error == native_result.error
        assert result.content == native_result.content
        assert result.encrypted_value is None
        assert not result.metadata or 'hashbrown.tool' not in result.metadata
        assert next(part for message in loaded for part in message.parts if isinstance(part, ToolReturnPart)).outcome == 'failed'


def test_installed_distribution_is_used():
    location = Path(inspect.getfile(AGUIAdapter)).resolve()

    assert 'site-packages' in location.parts, location
    assert AGUIAdapter.__module__ == 'hashbrown_pydantic_ai.adapter'


if __name__ == '__main__':
    tests = [(name, value) for name, value in list(globals().items()) if name.startswith('test_') and callable(value)]
    for name, test in tests:
        test()
        print(f'PASS {name}')
    print(f'{len(tests)} tests passed')
