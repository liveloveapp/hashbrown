import { expect, test } from 'vitest';
import {
  applySettings,
  DESIRED_PROJECT_SETTINGS,
  planSettings,
  type SettingsClient,
} from './settings.ts';

function fakeProject(
  project: Record<string, unknown>,
): SettingsClient & { patches: unknown[] } {
  const patches: unknown[] = [];
  return {
    patches,
    get: async () => project,
    patch: async (_path, body) => {
      patches.push(body);
      return { ...project, ...(body as object) };
    },
  };
}

test('settings plan reports drift and apply patches only drifted keys', async () => {
  const drifted = fakeProject({
    id: 1,
    autocapture_opt_out: true,
    name: 'hashbrown',
  });
  const clean = fakeProject({ id: 1, autocapture_opt_out: false });

  const plan = await planSettings(drifted);
  const applied = await applySettings(drifted);
  const noop = await applySettings(clean);

  expect(DESIRED_PROJECT_SETTINGS).toEqual({ autocapture_opt_out: false });
  expect(plan).toEqual([
    { key: 'autocapture_opt_out', current: true, desired: false },
  ]);
  expect(applied).toEqual(plan);
  expect(drifted.patches).toEqual([{ autocapture_opt_out: false }]);
  expect(noop).toEqual([]);
  expect(clean.patches).toEqual([]);
});
