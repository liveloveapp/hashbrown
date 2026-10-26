import { test } from '@playwright/test';
import {
  type DotnetFixture,
  type ModelStreamControl,
  withDotnetFixture as withHttpFixture,
} from './http-fixture';
import {
  type DurableFixtureCluster,
  withDurableCluster as withHttpCluster,
} from './durable-fixture';

export { control, durableEffects, waitForStage } from './durable-fixture';

/** Native model API selected explicitly by the current browser project. */
export type ModelApi = 'chat-completions' | 'responses';

/** Reads browser project selection without sharing mutable state with HTTP suites. */
export function projectModelApi(): ModelApi {
  const api = test.info().project.metadata['modelApi'];
  if (api !== 'chat-completions' && api !== 'responses')
    throw new Error('Browser project must explicitly select a model API');
  return api;
}

/** Runs an isolated browser fixture with its project-selected trusted server API. */
export function withDotnetFixture<T>(
  provider: 'openai' | 'azure',
  use: (fixture: DotnetFixture) => Promise<T>,
  workflow = '',
  streamControl?: ModelStreamControl,
  environment: Readonly<Record<string, string>> = {},
): Promise<T> {
  return withHttpFixture(provider, use, workflow, streamControl, {
    ModelApi: projectModelApi(),
    ...environment,
  });
}

/** Propagates the project API through every durable worker and restart. */
export function withDurableCluster<T>(
  provider: 'openai' | 'azure',
  use: (cluster: DurableFixtureCluster) => Promise<T>,
): Promise<T> {
  return withHttpCluster(provider, use, { ModelApi: projectModelApi() });
}
