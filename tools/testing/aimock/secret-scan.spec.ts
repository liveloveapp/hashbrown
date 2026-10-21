import { findCredentialLeaks, parseEnvFile } from './secret-scan';

test('reports a planted sk- key shape by pattern name', () => {
  const text = JSON.stringify({ note: 'sk-' + 'a1B2c3D4e5F6g7H8i9J0' });

  const leaks = findCredentialLeaks(text, {});

  expect(leaks).toEqual([{ kind: 'pattern', name: 'openai-key' }]);
});

test('reports other key shapes and credential header names', () => {
  const text = [
    'AKIA' + 'ABCDEFGHIJKLMNOP',
    'AIza' + 'A'.repeat(35),
    'Bearer ' + 'abc.def-ghi_jkl0123456789',
    'X-API-Key: nope',
    'Authorization: nope',
  ].join('\n');

  const leaks = findCredentialLeaks(text, {});

  expect(leaks.map((leak) => leak.name)).toEqual([
    'aws-access-key',
    'google-key',
    'bearer-token',
    'x-api-key-header',
    'authorization-header',
  ]);
});

test('reports a configured secret by variable name and never its value', () => {
  const value = 'super-secret-value-123';
  const text = `{"body":"${value}"}`;

  const leaks = findCredentialLeaks(text, { MY_API_KEY: value });

  expect(leaks).toEqual([{ kind: 'secret', name: 'MY_API_KEY' }]);
  expect(JSON.stringify(leaks)).not.toContain(value);
});

test('passes clean recordings', () => {
  const text = '{"role":"assistant","content":"[REDACTED] hello"}';

  const leaks = findCredentialLeaks(text, {
    MY_API_KEY: 'super-secret-value-123',
  });

  expect(leaks).toEqual([]);
});

test('parses KEY=VALUE lines, ignoring comments, export and quotes', () => {
  const source = [
    '# comment',
    'A=1',
    'export B="two"',
    "C='three'",
    '',
    'bad',
  ].join('\n');

  const env = parseEnvFile(source);

  expect(env).toEqual({ A: '1', B: 'two', C: 'three' });
});
