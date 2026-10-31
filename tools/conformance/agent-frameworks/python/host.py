"""Isolated deterministic Pydantic AI producer using the public AG-UI adapter."""
import asyncio
import json
from dataclasses import dataclass, field

from pydantic_ai import Agent, CancellationToken
from pydantic_ai.messages import ModelMessagesTypeAdapter, ToolReturnPart, UserPromptPart
from pydantic_ai.models.function import DeltaToolCall, FunctionModel
from pydantic_ai.ui.ag_ui import AGUIAdapter
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Route


@dataclass
class Thread:
    """Execution controls belong to one thread; state snapshots contain only JSON."""
    gate: asyncio.Event = field(default_factory=asyncio.Event)
    token: CancellationToken = field(default_factory=CancellationToken)
    observations: dict = field(default_factory=lambda: {
        'entered': 0, 'completed': 0, 'cancelled': 0, 'failed': 0,
        'settled': False, 'explicitCancel': False, 'streamEntered': False,
        'history': [], 'modelRequests': [], 'requests': [],
    })


threads = {}


def native(messages):
    """Serialize actual native messages without filtering or rewriting parts."""
    return json.loads(ModelMessagesTypeAdapter.dump_json(messages))


async def agent_endpoint(request):
    body = await request.json()
    thread_id = body.get('threadId')
    if not isinstance(thread_id, str) or not thread_id:
        return JSONResponse({'error': 'threadId required'}, status_code=400)
    thread = threads.setdefault(thread_id, Thread())
    if thread.observations['requests'] and not thread.observations['settled']:
        return JSONResponse({'error': 'thread already active'}, status_code=409)
    thread.gate = asyncio.Event()
    thread.token = CancellationToken()
    thread.observations['settled'] = False
    thread.observations['requests'].append(body)

    same_name = any(message.get('role') == 'user' and 'server-same-name' in str(message.get('content', '')) for message in body.get('messages', []))

    async def model_stream(messages, _info):
        thread.observations['modelRequests'].append(native(messages))
        parts = [part for message in messages for part in message.parts]
        last_user = next((part.content for part in reversed(parts) if isinstance(part, UserPromptPart)), '')
        last_returns = [part for part in messages[-1].parts if isinstance(part, ToolReturnPart)]
        if last_returns:
            yield f'Tool result: {last_returns[-1].content}'
        elif 'client-tool' in str(last_user):
            yield {0: DeltaToolCall(name='getWeather', json_args='{"city":"London"}', tool_call_id=f'{thread_id}-client')}
        elif 'server-tool' in str(last_user) or 'failure' in str(last_user) or same_name:
            name = 'failingTool' if 'failure' in str(last_user) else ('getWeather' if same_name else 'serverTool')
            yield {0: DeltaToolCall(name=name, json_args='{"city":"London"}', tool_call_id=f'{thread_id}-server')}
        else:
            yield 'Pydantic streaming '
            thread.observations['streamEntered'] = True
            await asyncio.wait_for(thread.gate.wait(), timeout=30)
            yield 'answer.'

    agent = Agent(FunctionModel(stream_function=model_stream))

    @agent.tool_plain(name='getWeather' if same_name else 'serverTool')
    async def serverTool(city: str) -> str:
        """Execute a real gated server action for a city."""
        thread.observations['entered'] += 1
        try:
            await asyncio.wait_for(thread.gate.wait(), timeout=30)
        except asyncio.CancelledError:
            thread.observations['cancelled'] += 1
            raise
        thread.observations['completed'] += 1
        return f'server-result:{city}'

    @agent.tool_plain
    async def failingTool(city: str) -> str:
        """Raise an actual callback exception."""
        thread.observations['failed'] += 1
        raise RuntimeError(f'controlled callback failure:{city}')

    def complete(result):
        thread.observations['history'] = native(result.all_messages())

    def cancelled(result):
        thread.observations['history'] = native(result.all_messages())

    response = await AGUIAdapter.dispatch_request(
        request, agent=agent, cancellation_token=thread.token,
        on_complete=complete, on_cancel=cancelled,
    )
    original = response.body_iterator

    async def observe_stream():
        try:
            async for chunk in original:
                yield chunk
        finally:
            thread.observations['settled'] = True

    response.body_iterator = observe_stream()
    return response


async def control(request):
    thread = threads.get(request.path_params['thread_id'])
    if thread is None:
        return JSONResponse({'error': 'unknown thread'}, status_code=404)
    action = request.path_params.get('action')
    if action == 'release':
        thread.gate.set()
    elif action == 'cancel':
        thread.observations['explicitCancel'] = True
        thread.token.cancel()
    return JSONResponse(thread.observations)


async def health(_request):
    return JSONResponse({'ready': True})


app = Starlette(routes=[
    Route('/health', health),
    Route('/agent', agent_endpoint, methods=['POST']),
    Route('/control/{thread_id}', control),
    Route('/control/{thread_id}/{action}', control, methods=['POST']),
])
app = CORSMiddleware(app, allow_origins=['*'], allow_methods=['GET', 'POST'], allow_headers=['*'])
