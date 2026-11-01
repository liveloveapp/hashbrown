/** Controlled Node child used only to exercise package launch, identity, environment, and drain boundaries. */
export const packageLiveWorker = String.raw`#!${process.execPath}
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const executable = process.argv[2];
const library = path.join(path.dirname(executable), 'Hashbrown.AspNetCore.dll');
const identity = { identity: 'Hashbrown.AspNetCore, Version=0.1.0.0, Culture=neutral, PublicKeyToken=null', location: library, sha256: crypto.createHash('sha256').update(fs.readFileSync(library)).digest('hex') };
const root = path.resolve(__dirname, '..');
const role = executable.includes('/probe/') ? 'probe' : process.env.FixtureDropSchemaOnly === 'true' ? 'cleanup' : 'fixture';
const selected = Object.fromEntries(['ApiKey','AZURE_CONFIG_DIR','FixtureLive','InterruptSchema','InterruptConnectionString','DOTNET_ROOT','NODE_OPTIONS','UNREVIEWED_SECRET'].map(key => [key, process.env[key]]));
fs.appendFileSync(path.join(root, 'spawn-observations.jsonl'), JSON.stringify({ pid: process.pid, role, selected }) + '\n');
process.stderr.write('stderr-private-secret-canary\n');
process.stdout.write('stdout-private-secret-canary\n');
const emit = () => {
  if (process.env.Model === 'missing') return;
  const actual = process.env.Model === 'wrong' ? { ...identity, sha256: '0'.repeat(64) } : identity;
  const value = 'HASHBROWN_PACKAGE_IDENTITY:' + JSON.stringify(actual) + '\n';
  if (process.env.Model === 'split') for (const byte of Buffer.from(value)) process.stdout.write(Buffer.from([byte]));
  else process.stdout.write(value);
};
if (role === 'probe') {
  emit();
  console.log('Live approval real journal and native SDK proof passed; in-memory transport only.');
} else {
  const server = http.createServer((request,response) => { request.resume(); response.end('ok'); });
  server.listen(0, '127.0.0.1', () => {
    if (process.env.Model === 'exit') { emit(); process.exit(0); }
    console.log('Now listening on: http://127.0.0.1:' + server.address().port);
    emit();
  });
}
`;
