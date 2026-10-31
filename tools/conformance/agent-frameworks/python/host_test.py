"""Stdlib manifest and syntax checks; HTTP behavior is in controller.spec.mjs."""
import ast
import asyncio
import json
import os
from pathlib import Path
import sys
import tomllib

ROOT = Path(__file__).parent


def test_exact_pins():
    manifest = tomllib.loads((ROOT / 'pyproject.toml').read_text())

    assert manifest['project']['requires-python'] == '==3.12.12'
    assert manifest['project']['dependencies'] == [
        'pydantic-ai-slim[ag-ui]==2.64.0', 'ag-ui-protocol==1.0.0',
        'starlette==1.10.0', 'uvicorn==0.54.0',
    ]
    assert sys.version_info[:3] == (3, 12, 12)
    assert (ROOT / '.python-version').read_text().strip() == '3.12.12'


def test_lock_and_syntax():
    lock = tomllib.loads((ROOT / 'uv.lock').read_text())
    packages = {package['name']: package['version'] for package in lock['package']}

    assert packages['pydantic-ai-slim'] == '2.64.0'
    assert packages['ag-ui-protocol'] == '1.0.0'
    assert packages['starlette'] == '1.10.0'
    assert packages['uvicorn'] == '0.54.0'
    for source in ROOT.glob('*.py'):
        ast.parse(source.read_text(), filename=str(source))


def test_terminal_send_keeps_thread_owned_until_stream_finishes():
    """A paused real ASGI terminal send cannot admit an overlapping native run."""
    os.environ['PYDANTIC_AI_NO_BANNER'] = '1'
    import host
    from starlette.requests import Request

    async def exercise():
        terminal = asyncio.Event()
        resume = asyncio.Event()
        body = {'threadId': 'asgi-settlement', 'runId': 'first-run', 'messages': [
            {'id': 'user', 'role': 'user', 'content': 'streaming'}],
            'tools': [], 'context': [], 'state': {}, 'forwardedProps': {}, 'protocolVersion': '1.0'}
        received = False

        async def receive():
            nonlocal received
            if not received:
                received = True
                return {'type': 'http.request', 'body': json.dumps(body).encode(), 'more_body': False}
            await asyncio.Event().wait()

        async def send(message):
            if message['type'] == 'http.response.body' and b'RUN_FINISHED' in message.get('body', b''):
                terminal.set()
                await resume.wait()

        scope = {'type': 'http', 'asgi': {'version': '3.0', 'spec_version': '2.4'},
                 'method': 'POST', 'path': '/agent', 'raw_path': b'/agent', 'query_string': b'',
                 'headers': [(b'content-type', b'application/json'), (b'accept', b'text/event-stream')],
                 'scheme': 'http', 'server': ('127.0.0.1', 9000), 'client': ('127.0.0.1', 9001),
                 'http_version': '1.1'}
        task = asyncio.create_task(host.app(scope, receive, send))
        try:
            async def entered():
                while body['threadId'] not in host.threads or not host.threads[body['threadId']].observations['streamEntered']:
                    await asyncio.sleep(0)

            await asyncio.wait_for(entered(), timeout=5)
            thread = host.threads[body['threadId']]
            thread.gate.set()
            await asyncio.wait_for(terminal.wait(), timeout=5)

            async def receive_next():
                return {'type': 'http.request', 'body': json.dumps({**body, 'runId': 'second-run'}).encode(), 'more_body': False}

            overlap = await host.agent_endpoint(Request(scope, receive_next))

            assert thread.observations['settled'] is False
            assert overlap.status_code == 409
            assert len(thread.observations['requests']) == 1
            resume.set()
            await asyncio.wait_for(task, timeout=5)
            assert thread.observations['settled'] is True

            retry = await host.agent_endpoint(Request(scope, receive_next))

            assert retry.status_code == 200
            assert thread.observations['settled'] is False
            assert len(thread.observations['requests']) == 2
            await retry.body_iterator.aclose()
        finally:
            resume.set()
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            host.threads.pop(body['threadId'], None)

    asyncio.run(exercise())


if __name__ == '__main__':
    test_exact_pins()
    test_lock_and_syntax()
    test_terminal_send_keeps_thread_owned_until_stream_finishes()
    print('Python pins, complete lock and syntax checks passed')
