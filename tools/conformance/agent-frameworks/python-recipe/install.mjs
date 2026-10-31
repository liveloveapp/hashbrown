import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = 'tools/conformance/agent-frameworks/python-recipe';
const wheel =
  'packages/pydantic-ai/dist/hashbrown_pydantic_ai-0.1.0-py3-none-any.whl';

/** Run each pinned installation step directly, with bounded failure propagation. */
function run(file, args) {
  const result = spawnSync(file, args, {
    encoding: 'utf8',
    timeout: 300000,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (result.error || result.status !== 0)
    throw result.error ?? new Error(`${file} exited ${result.status}`);
  return result.stdout;
}

run('uv', ['sync', '--frozen', '--project', fixture]);
run('uv', [
  'pip',
  'install',
  '--python',
  `${fixture}/.venv/bin/python`,
  '--no-deps',
  '--reinstall',
  wheel,
]);
const observed = run(`${fixture}/.venv/bin/python`, [
  '-c',
  `
import hashlib,inspect,json,sys,zipfile
from pathlib import Path
from importlib.metadata import version
import hashbrown_pydantic_ai
wheel=Path(sys.argv[1])
module=Path(inspect.getfile(hashbrown_pydantic_ai)).resolve()
assert 'site-packages' in module.parts
assert module.is_relative_to(Path(sys.prefix).resolve())
with zipfile.ZipFile(wheel) as archive:
    for name in archive.namelist():
        if name.startswith('hashbrown_pydantic_ai/') and not name.endswith('/'):
            assert (module.parent.parent/name).read_bytes()==archive.read(name), name
print(json.dumps({'distribution':'hashbrown-pydantic-ai','version':version('hashbrown-pydantic-ai'),'installedFromWheel':True,'importedFromInstalledDistribution':True,'adapterFile':'site-packages/hashbrown_pydantic_ai/__init__.py','wheel':{'path':sys.argv[1],'sha256':hashlib.sha256(wheel.read_bytes()).hexdigest()}}))
`,
  wheel,
]);
const directory = resolve('test-results/pydantic-recipe');
mkdirSync(directory, { recursive: true });
writeFileSync(
  resolve(directory, 'installation.json'),
  `${JSON.stringify(JSON.parse(observed), null, 2)}\n`,
);
