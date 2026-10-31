"""Build, syntax-check, or qualify the wheel in a disposable pinned environment."""

import ast
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent.parent
PINNED_HOST = WORKSPACE / 'tools/conformance/agent-frameworks/python'


def run(*args, env=None):
    """Run a command without a shell and propagate failures."""
    subprocess.run(args, check=True, cwd=WORKSPACE, env=env)


def main():
    """Execute the requested package check using only approved dependencies."""
    action = sys.argv[1]
    if action == 'lint':
        sources = [ROOT / 'check.py', *ROOT.glob('src/**/*.py'), *ROOT.glob('tests/*.py')]
        for path in sources:
            ast.parse(path.read_text(), filename=str(path))
        print(f'Python syntax checked: {len(sources)} files (no external linter configured)')
        return

    uv = shutil.which('uv')
    if uv is None:
        raise SystemExit('uv is required; qualification uses uv 0.11.3')
    env = {**os.environ, 'UV_CACHE_DIR': os.environ.get('UV_CACHE_DIR', str(Path(tempfile.gettempdir()) / 'hashbrown-python-uv-cache')), 'PYDANTIC_AI_NO_BANNER': '1'}
    run(uv, 'build', '--out-dir', str(ROOT / 'dist'), str(ROOT), env=env)
    if action == 'build':
        return
    if action != 'test':
        raise SystemExit(f'Unknown check: {action}')

    with tempfile.TemporaryDirectory(prefix='hashbrown-pydantic-test-') as temporary:
        directory = Path(temporary)
        environment = directory / 'venv'
        requirements = directory / 'requirements.txt'
        # Reuse the untouched native fixture's complete hashed lock, not mutable
        # runtime resolution of the distribution's intentionally broader ranges.
        run(uv, 'export', '--frozen', '--quiet', '--project', str(PINNED_HOST), '--no-dev', '--no-emit-project', '--output-file', str(requirements), env=env)
        run(uv, 'venv', '--python', (PINNED_HOST / '.python-version').read_text().strip(), str(environment), env=env)
        python = str(environment / 'bin/python')
        run(uv, 'pip', 'install', '--python', python, '--require-hashes', '-r', str(requirements), env=env)
        wheel = ROOT / 'dist/hashbrown_pydantic_ai-0.1.0-py3-none-any.whl'
        # The preceding lock supplies exact runtime dependencies. Do not let
        # wheel installation silently change them during qualification.
        run(uv, 'pip', 'install', '--python', python, '--no-deps', str(wheel), env=env)
        run(uv, 'pip', 'check', '--python', python, env=env)
        run(python, str(ROOT / 'tests/adapter_test.py'), env=env)


if __name__ == '__main__':
    main()
