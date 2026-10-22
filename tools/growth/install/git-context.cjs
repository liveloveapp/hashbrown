'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { readBounded } = require('./files.cjs');
const { truthy, packageManager } = require('./policy.cjs');
const hasControls = (value, includeSpace = false) =>
  [...value].some(
    (char) =>
      char.charCodeAt(0) < (includeSpace ? 33 : 32) ||
      char.charCodeAt(0) === 127
  );

function valueOf(raw) {
  let value = '',
    quoted = false,
    escaped = false;
  for (const char of raw.trim()) {
    if (escaped) {
      if (!['\\', '"', 'n', 't', 'b'].includes(char)) return undefined;
      value += { n: '\n', t: '\t', b: '\b' }[char] ?? char;
      escaped = false;
    } else if (char === '\\') escaped = true;
    else if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '#' || char === ';')) break;
    else value += char;
  }
  return quoted || escaped ? undefined : value.trim();
}
/**
 * Parses the `[user]`, `[extensions]`, and origin `[remote]` sections of a git config.
 * @param {string} text Raw git config contents.
 * @returns {{ name?: string, email?: string, remote?: string, worktreeConfig?: boolean }}
 */
function parseConfig(text) {
  const result = {};
  const remoteUrls = new Set();
  let section = '';
  for (const line of (text ?? '').split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      section = /^\s*\[user\]\s*(?:[#;].*)?$/i.test(line)
        ? 'user'
        : /^\s*\[extensions\]\s*(?:[#;].*)?$/i.test(line)
        ? 'extensions'
        : /^\s*\[[rR][eE][mM][oO][tT][eE]\s+"origin"\]\s*(?:[#;].*)?$/.test(
            line
          )
        ? 'remote'
        : '';
      continue;
    }
    const match = /^\s*([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (section === 'extensions' && key === 'worktreeconfig')
      result.worktreeConfig = /^(true|yes|on|1)$/i.test(
        valueOf(match[2]) ?? ''
      );
    if (section === 'user' && ['name', 'email'].includes(key))
      result[key] = valueOf(match[2]) ?? '';
    if (section === 'remote' && key === 'url') {
      remoteUrls.add(valueOf(match[2]) ?? '');
      result.remote = remoteUrls.size === 1 ? [...remoteUrls][0] : '';
    }
  }
  return result;
}
/**
 * Derives a provider and owner from a remote URL, for known hosts only.
 * @param {unknown} remote The origin remote URL.
 * @returns {{ repositoryProvider?: 'github'|'gitlab'|'bitbucket', repositoryOwner?: string }}
 */
function repositoryHint(remote) {
  if (
    typeof remote !== 'string' ||
    remote.length > 2048 ||
    hasControls(remote, true)
  )
    return {};
  let host, pathname;
  try {
    if (/^(https|ssh):\/\//i.test(remote)) {
      const url = new URL(remote);
      host = url.hostname.toLowerCase();
      pathname = url.pathname;
      if (url.port && !['443', '22'].includes(url.port)) return {};
    } else {
      const match =
        /^(?:[a-zA-Z0-9_.-]+@)?(github\.com|gitlab\.com|bitbucket\.org):([^?#]+)(?:[?#].*)?$/.exec(
          remote
        );
      if (!match) return {};
      host = match[1];
      pathname = '/' + match[2];
    }
    const provider = {
      'github.com': 'github',
      'gitlab.com': 'gitlab',
      'bitbucket.org': 'bitbucket',
    }[host];
    const match =
      /^\/([a-zA-Z0-9][a-zA-Z0-9_.-]{0,99})\/([a-zA-Z0-9][a-zA-Z0-9_.-]*)\/?$/.exec(
        pathname
      );
    if (!provider || !match) return {};
    return { repositoryProvider: provider, repositoryOwner: match[1] };
  } catch {
    return {};
  }
}
function inDependency(value) {
  return value.split(path.sep).includes('node_modules');
}
async function consumerConfig(env, packageRoot) {
  if (
    packageManager(env.npm_config_user_agent).packageManager === 'unknown' ||
    truthy(env.npm_config_global) ||
    truthy(env.NPM_CONFIG_GLOBAL)
  )
    return null;
  if (
    typeof env.INIT_CWD !== 'string' ||
    !path.isAbsolute(env.INIT_CWD) ||
    env.INIT_CWD.length > 4096 ||
    inDependency(env.INIT_CWD)
  )
    return null;
  try {
    let directory = await fs.realpath(env.INIT_CWD);
    const own = await fs.realpath(packageRoot);
    if (inDependency(directory) || !(await fs.stat(directory)).isDirectory())
      return null;
    for (let depth = 0; depth < 32; depth++) {
      const relative = path.relative(directory, own);
      if (
        relative === '' ||
        (!relative.startsWith('..' + path.sep) &&
          !path.isAbsolute(relative) &&
          !inDependency(relative))
      )
        return null;
      const marker = path.join(directory, '.git');
      let stat;
      try {
        stat = await fs.lstat(marker);
      } catch {
        /* Keep looking up. */
      }
      if (stat?.isDirectory())
        return {
          common: path.join(marker, 'config'),
          worktree: path.join(marker, 'config.worktree'),
        };
      if (stat?.isFile()) {
        const contents = await readBounded(marker, 4096);
        const match = contents && /^gitdir: ([^\r\n]+)\r?\n?$/.exec(contents);
        if (!match) return null;
        const gitdir = path.resolve(directory, match[1]);
        if (!(await fs.stat(gitdir)).isDirectory()) return null;
        const common = await readBounded(path.join(gitdir, 'commondir'), 4096);
        if (common && !/^[^\r\n]+\r?\n?$/.test(common)) return null;
        return {
          worktree: path.join(gitdir, 'config.worktree'),
          common: path.join(
            common ? path.resolve(gitdir, common.trim()) : gitdir,
            'config'
          ),
        };
      }
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  } catch {
    /* Unknown checkout is valid missing evidence. */
  }
  return null;
}
function bounded(value, maximum) {
  if (typeof value !== 'string' || hasControls(value)) return undefined;
  const text = value.trim().normalize('NFC');
  return text && text.length <= maximum ? text : undefined;
}
/**
 * Discovers bounded git identity and the consuming checkout, never using a global remote as a hint.
 * @param {{ home: string, packageRoot: string, env: Record<string, string | undefined> }} options
 * @returns {Promise<{ consumerContext: 'checkout'|'unavailable', identity: Record<string, string> }>}
 */
async function discoverGit({ home, packageRoot, env }) {
  const xdg =
    typeof env.XDG_CONFIG_HOME === 'string' &&
    path.isAbsolute(env.XDG_CONFIG_HOME)
      ? env.XDG_CONFIG_HOME
      : path.join(home, '.config');
  const global = {
    ...parseConfig(await readBounded(path.join(xdg, 'git/config'))),
    ...parseConfig(await readBounded(path.join(home, '.gitconfig'))),
  };
  const config = await consumerConfig(env, packageRoot);
  const common = config ? parseConfig(await readBounded(config.common)) : {};
  const worktree = common.worktreeConfig
    ? parseConfig(await readBounded(config.worktree))
    : {};
  const local = { ...common, ...worktree };
  if (
    Object.hasOwn(common, 'remote') &&
    Object.hasOwn(worktree, 'remote') &&
    common.remote !== worktree.remote
  )
    local.remote = '';
  const merged = { ...global, ...local };
  const identity = {};
  const origins = [];
  const name = bounded(merged.name, 160),
    email = bounded(merged.email, 320)?.toLowerCase();
  if (name) {
    identity.gitDisplayName = name;
    origins.push(Object.hasOwn(local, 'name') ? 'local' : 'global');
  }
  if (email && /^[^\s@]+@[^\s@]+$/u.test(email)) {
    identity.gitEmail = email;
    origins.push(Object.hasOwn(local, 'email') ? 'local' : 'global');
  }
  if (origins.length)
    identity.gitConfigOrigin =
      new Set(origins).size === 1 ? origins[0] : 'unknown';
  // A global remote is not evidence about this consuming checkout.
  if (config) Object.assign(identity, repositoryHint(local.remote));
  return { consumerContext: config ? 'checkout' : 'unavailable', identity };
}
module.exports = { parseConfig, repositoryHint, discoverGit };
