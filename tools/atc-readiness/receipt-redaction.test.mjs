import test from 'node:test';
import assert from 'node:assert/strict';
import { createRedactor } from './common.mjs';
import { createReceiptRedactor } from './receipt-redaction.mjs';

test('tiny model fragments only sanitize diagnostic fields, preserving authority metadata', () => {
  const credential = 'full-secret-credential-46a';
  const cookie = 'atc_visitor=full-cookie-46a';
  const rawModel = '{"text":"46a model response"}';
  const prompt = 'full synthetic prompt';
  const redact = createReceiptRedactor({
    redactCredentials: createRedactor([credential]),
    credentials: () => [cookie],
    modelText: () => [rawModel, prompt, '4', '6', 'a', '[', ']', 'A'],
  });
  const metadata = {
    id: '46a12345-1234-4234-8234-123456789abc',
    runId: '46a12345-1234-4234-8234-123456789abc',
    threadIds: ['readiness-46a'],
    canonical: { tuplesSha256: 'a'.repeat(64) },
    terminalModel: 'gpt-5.4-mini',
    terminalProviderResponseId: 'resp_46a',
  };

  const result = redact({
    ...metadata,
    error: new Error(rawModel + ' ' + prompt + ' ' + credential + ' ' + cookie),
    credentials: { value: credential, cookie },
    responseBody: rawModel,
    nested: { error: { message: rawModel, runId: metadata.runId } },
  });

  for (const key of Object.keys(metadata))
    assert.deepEqual(result[key], metadata[key]);
  assert.equal(result.nested.error.runId, metadata.runId);
  assert(!JSON.stringify(result).includes(rawModel));
  assert(!JSON.stringify(result).includes(prompt));
  assert(!JSON.stringify(result).includes(credential));
  assert(!JSON.stringify(result).includes(cookie));
  assert.equal(result.responseBody, '[REDACTED]');
  assert.deepEqual(redact(result), result);
});

test('credential redaction applies before model sanitization even for authority-looking secrets', () => {
  const credential = 'a'.repeat(64);
  const redact = createReceiptRedactor({
    redactCredentials: createRedactor([credential]),
    modelText: () => ['a'],
  });

  const result = redact({
    artifactSha256: credential,
    providerUsage: [{ model: 'gpt-5.4-mini', responseId: 'resp_46a' }],
    error: credential,
  });

  assert.equal(result.artifactSha256, '[REDACTED]');
  assert.equal(result.error, '[REDACTED]');
  assert.deepEqual(result.providerUsage, [
    { model: 'gpt-5.4-mini', responseId: 'resp_46a' },
  ]);
});

test('raw model fields are suppressed while numeric usage and exact hash fields remain intact', () => {
  const redact = createReceiptRedactor({
    redactCredentials: createRedactor(),
    modelText: () => ['a'],
  });
  const hash = 'a'.repeat(64);

  const result = redact({
    body: { nested: 'unobserved raw response' },
    responseText: 'unobserved response',
    content: [{ text: 'raw model output' }],
    outputSha256: hash,
    markerSha256: hash,
    providerUsage: [{ usage: { text: 46, output: 4 } }],
  });

  assert.equal(result.body, '[REDACTED]');
  assert.equal(result.responseText, '[REDACTED]');
  assert.equal(result.content, '[REDACTED]');
  assert.equal(result.outputSha256, hash);
  assert.equal(result.markerSha256, hash);
  assert.deepEqual(result.providerUsage, [{ usage: { text: 46, output: 4 } }]);
});
