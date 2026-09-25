import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import {
  InstallCommand,
  sdkForKey,
  splitInstallCommand,
} from '../../src/components/home/InstallCommand';

test('splits the command after the npm scope so it wraps there', () => {
  const command = 'npm i @hashbrownai/{core,react,openai}';

  const result = splitInstallCommand(command);

  expect(result).toEqual(['npm i @hashbrownai/', '{core,react,openai}']);
});

test('arrow keys move to the other framework and wrap around', () => {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];

  const result = keys.map((key) => sdkForKey('react', key));

  expect(result).toEqual(['angular', 'angular', 'angular', 'angular']);
});

test('other keys leave the selection alone', () => {
  const key = 'Enter';

  const result = sdkForKey('angular', key);

  expect(result).toBeUndefined();
});

test('renders Angular first and selected by default', () => {
  const html = renderToStaticMarkup(<InstallCommand />);

  expect(html).toContain('role="radiogroup"');
  expect(html).toMatch(
    /aria-checked="true" tabindex="0"[^>]*>Angular<\/button>.*aria-checked="false" tabindex="-1"[^>]*>React<\/button>/,
  );
  expect(html).toContain('npm i @hashbrownai/<wbr/>{core,angular,openai}');
  expect(html).toContain('aria-label="Copy install command"');
});
