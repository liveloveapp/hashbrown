import { expect, test } from 'vitest';
import {
  agentPrompt,
  CAPABILITIES,
  HERO_CODE,
  installCommand,
  quickStartUrl,
  STEPS,
  THREADPLANE_URL,
} from './home.content';

test('installs the React packages for React', () => {
  const result = installCommand('react');

  expect(result).toBe('npm i @hashbrownai/{core,react,openai}');
});

test('installs the Angular packages for Angular', () => {
  const result = installCommand('angular');

  expect(result).toBe('npm i @hashbrownai/{core,angular,openai}');
});

test('points the agent prompt at llms.txt and the framework', () => {
  const result = agentPrompt('angular');

  expect(result).toContain('https://hashbrown.dev/llms.txt');
  expect(result).toContain('Angular');
  expect(result).toContain(installCommand('angular'));
});

test('links quick start to the selected framework', () => {
  const result = quickStartUrl('react');

  expect(result).toBe('/docs/react/start/quick');
});

test('uses the UI kit APIs in the hero code', () => {
  const react = HERO_CODE.react.code;
  const angular = HERO_CODE.angular.code;

  expect(react).toContain('useUiKit(');
  expect(react).toContain('useUiChat(');
  expect(angular).toContain('createUiKit(');
  expect(angular).toContain('uiChatResource(');
});

test('has three steps for each framework', () => {
  const counts = [STEPS.react.length, STEPS.angular.length];

  expect(counts).toEqual([3, 3]);
});

test('has six capability groups with docs links', () => {
  const paths = CAPABILITIES.map((capability) => capability.docsPath);

  expect(paths).toHaveLength(6);
  expect(paths.every((path) => path.length === 2)).toBe(true);
});

test('tags the threadplane link with hashbrown UTM parameters', () => {
  const url = new URL(THREADPLANE_URL);

  expect(url.hostname).toBe('threadplane.ai');
  expect(url.searchParams.get('utm_source')).toBe('hashbrown');
  expect(url.searchParams.get('utm_campaign')).toBe('headful_banner');
});
