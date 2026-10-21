'use strict';
/** Whether an environment value is an affirmative flag (1, true, yes). */
const truthy = (value) =>
  typeof value === 'string' && /^(1|true|yes)$/i.test(value.trim());
/** Whether any telemetry opt-out variable is set. */
function disabled(env) {
  return [
    'DO_NOT_TRACK',
    'npm_config_do_not_track',
    'NPM_CONFIG_DO_NOT_TRACK',
    'HASHBROWN_TELEMETRY_DISABLED',
  ].some((key) => truthy(env[key]));
}
/** Parses the npm user agent into a package manager name and version. */
function packageManager(agent) {
  const match =
    typeof agent === 'string' &&
    agent.length <= 1024 &&
    /^(npm|pnpm|yarn|bun)\/([0-9][a-zA-Z0-9.+-]{0,63})(?:\s|$)/.exec(agent);
  return match
    ? { packageManager: match[1], packageManagerVersion: match[2] }
    : { packageManager: 'unknown' };
}
/** Classifies the install environment as ci, local or unknown. */
function environment(env, interactive, manager) {
  const indicators = [
    ['github_actions', truthy(env.GITHUB_ACTIONS)],
    ['gitlab_ci', truthy(env.GITLAB_CI)],
    [
      'jenkins',
      typeof env.JENKINS_URL === 'string' && env.JENKINS_URL.length > 0,
    ],
    ['travis', truthy(env.TRAVIS)],
    ['circleci', truthy(env.CIRCLECI)],
    ['bitbucket', /^\d+$/.test(env.BITBUCKET_BUILD_NUMBER ?? '')],
    ['buildkite', truthy(env.BUILDKITE)],
    [
      'generic_ci',
      ['CI', 'CONTINUOUS_INTEGRATION', 'VERCEL', 'TF_BUILD'].some((key) =>
        truthy(env[key]),
      ),
    ],
  ];
  const provider = indicators.find(([, present]) => present)?.[0];
  if (provider)
    return {
      environment: 'ci',
      environmentEvidence: provider,
      ciProvider: provider,
    };
  if (interactive && manager !== 'unknown')
    return {
      environment: 'local',
      environmentEvidence: 'interactive_package_manager',
    };
  return { environment: 'unknown', environmentEvidence: 'unknown' };
}
const DEFAULT_ENDPOINT = 'https://hashbrown.dev/_/growth/collect/v1/install';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Resolves the collection endpoint. Only a loopback override over http or
 * https is honoured; anything else yields the default endpoint.
 */
function endpoint(env) {
  const value = env.HASHBROWN_TELEMETRY_ENDPOINT;
  if (typeof value !== 'string') return DEFAULT_ENDPOINT;
  try {
    const url = new URL(value);
    const protocol = url.protocol === 'http:' || url.protocol === 'https:';
    return protocol && LOOPBACK.has(url.hostname) ? value : DEFAULT_ENDPOINT;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}
module.exports = { truthy, disabled, packageManager, environment, endpoint };
