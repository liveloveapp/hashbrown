import { expect, test, vi } from 'vitest';

import { jsonResponse } from '../channels/test-fetch.ts';
import { createGitHubClient } from './github.ts';

const TOKEN = 'ghp_secret_token';
const BASE = 'https://api.github.com/repos/liveloveapp/hashbrown';

function setup(response: Response | (() => Response)) {
  const fetchMock = vi.fn(async () =>
    typeof response === 'function' ? response() : response,
  );
  const github = createGitHubClient(
    TOKEN,
    fetchMock as unknown as typeof fetch,
  );
  const call = (n = 0) => {
    const [url, init] = fetchMock.mock.calls[n] as unknown as [
      string,
      RequestInit,
    ];
    return {
      url,
      method: init.method,
      headers: init.headers as Record<string, string>,
      body: init.body as string | undefined,
    };
  };
  return { github, fetchMock, call };
}

test('updateBranch PUTs update-branch with auth headers', async () => {
  const { github, call } = setup(
    jsonResponse({ message: 'Updating' }, { status: 202 }),
  );
  await github.updateBranch(12);
  const c = call();
  expect(c.url).toBe(`${BASE}/pulls/12/update-branch`);
  expect(c.method).toBe('PUT');
  expect(c.headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  expect(c.headers['Accept']).toBe('application/vnd.github+json');
  expect(c.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  expect(c.headers['User-Agent']).toBeTruthy();
});

test('updateBranch treats an already up to date 422 as success', async () => {
  const { github } = setup(
    jsonResponse(
      { message: 'Head branch is already up to date with the base branch.' },
      { status: 422 },
    ),
  );
  await expect(github.updateBranch(12)).resolves.toBeUndefined();
});

test('updateBranch throws on any other 422 without the token', async () => {
  const { github } = setup(
    jsonResponse({ message: 'merge conflict' }, { status: 422 }),
  );
  const err = await github.updateBranch(12).catch((e: Error) => e);
  expect((err as Error).message).toContain('422');
  expect((err as Error).message).not.toContain(TOKEN);
});

test('pullState GETs the pull and maps the fields', async () => {
  const { github, call } = setup(
    jsonResponse({ merged: false, mergeable: true, mergeable_state: 'clean' }),
  );
  const state = await github.pullState(7);
  expect(state).toEqual({
    merged: false,
    mergeable: true,
    mergeableState: 'clean',
  });
  const c = call();
  expect(c.url).toBe(`${BASE}/pulls/7`);
  expect(c.method).toBe('GET');
  expect(c.headers['Authorization']).toBe(`Bearer ${TOKEN}`);
});

test('pullState keeps a null mergeable', async () => {
  const { github } = setup(
    jsonResponse({
      merged: false,
      mergeable: null,
      mergeable_state: 'unknown',
    }),
  );
  expect((await github.pullState(7)).mergeable).toBeNull();
});

test('merge PUTs a squash merge and does not retry a 5xx', async () => {
  const { github, call, fetchMock } = setup(() =>
    jsonResponse({ message: 'boom' }, { status: 502 }),
  );
  await expect(github.merge(7)).rejects.toThrow('502');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const c = call();
  expect(c.url).toBe(`${BASE}/pulls/7/merge`);
  expect(c.method).toBe('PUT');
  expect(JSON.parse(c.body as string)).toEqual({ merge_method: 'squash' });
  expect(c.headers['Authorization']).toBe(`Bearer ${TOKEN}`);
});

test('readFile GETs contents at ref main and decodes base64', async () => {
  const content = Buffer.from('héllo\nworld').toString('base64');
  const { github, call } = setup(
    jsonResponse({
      content: content.replace(/(.{10})/g, '$1\n'),
      encoding: 'base64',
    }),
  );
  expect(await github.readFile('apps/www/a b.md', 'main')).toBe('héllo\nworld');
  const c = call();
  expect(c.url).toBe(`${BASE}/contents/apps/www/a%20b.md?ref=main`);
  expect(c.method).toBe('GET');
});
