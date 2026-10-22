import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { parseConfig, repositoryHint, discoverGit } = require('./git-context.cjs');

async function fixture({ globalConfig, localConfig }) {
  const root = await mkdtemp(join(tmpdir(), 'git-context-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  const packageRoot = join(project, 'node_modules/@hashbrownai/core');
  await mkdir(home, { recursive: true });
  await mkdir(join(project, '.git'), { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(home, '.gitconfig'), globalConfig);
  await writeFile(join(project, '.git/config'), localConfig);
  return { home, project, packageRoot };
}

test('parseConfig reads user and origin remote', () => {
  const text =
    '[user]\n\tname = Dev\n\temail = Dev@Example.com\n[remote "origin"]\n\turl = git@github.com:acme/widgets.git\n';

  const result = parseConfig(text);

  assert.deepEqual(result, {
    name: 'Dev',
    email: 'Dev@Example.com',
    remote: 'git@github.com:acme/widgets.git',
  });
});

test('repositoryHint reports the owner for ssh and https remotes and nothing else', () => {
  const https = repositoryHint('https://token@github.com/acme/widgets.git');
  const ssh = repositoryHint('git@gitlab.com:team/app');
  const other = repositoryHint('https://git.corp.example/acme/widgets.git');

  assert.deepEqual(https, { repositoryProvider: 'github', repositoryOwner: 'acme' });
  assert.deepEqual(ssh, { repositoryProvider: 'gitlab', repositoryOwner: 'team' });
  assert.deepEqual(other, {});
});

test('discoverGit merges global identity with the consuming checkout', async () => {
  const { home, project, packageRoot } = await fixture({
    globalConfig: '[user]\n\tname = Global\n',
    localConfig:
      '[user]\n\temail = Dev@Example.com\n[remote "origin"]\n\turl = https://github.com/acme/widgets.git\n',
  });
  const env = { INIT_CWD: project, npm_config_user_agent: 'npm/10.0.0 node/v20' };

  const result = await discoverGit({ home, packageRoot, env });

  assert.deepEqual(result, {
    consumerContext: 'checkout',
    identity: {
      gitDisplayName: 'Global',
      gitEmail: 'dev@example.com',
      gitConfigOrigin: 'unknown',
      repositoryProvider: 'github',
      repositoryOwner: 'acme',
    },
  });
});

test('discoverGit reports unavailable without INIT_CWD and never reads a global remote as a hint', async () => {
  const { home, packageRoot } = await fixture({
    globalConfig:
      '[user]\n\tname = Global\n[remote "origin"]\n\turl = https://github.com/acme/widgets.git\n',
    localConfig: '',
  });
  const env = { npm_config_user_agent: 'npm/10.0.0 node/v20' };

  const result = await discoverGit({ home, packageRoot, env });

  assert.equal(result.consumerContext, 'unavailable');
  assert.equal(result.identity.gitDisplayName, 'Global');
  assert.equal(result.identity.repositoryOwner, undefined);
});
