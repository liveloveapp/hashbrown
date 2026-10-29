import { nativeBrowserSmoke } from '../harness/browser-smoke-selection';

test('the PR browser smoke retains the complete integration journey', () => {
  const essential = [
    'renders partial text before the native model finishes',
    'streams text through the real .NET provider',
    'renders structured using the exact native output schema',
    'renders ui using the exact native output schema',
    'executes a browser tool and resumes through the .NET agent',
    'exposes native interrupts and resumes through the public API',
    'handles decline through the public resume API',
    'handles cancel through the public resume API',
  ];

  const selected = essential.map((title) => nativeBrowserSmoke.test(title));

  expect(selected).toEqual(essential.map(() => true));
});

test('the PR smoke does not select the full recovery regression matrix', () => {
  const regression =
    'keeps the browser batch while resume is held and rejects its replay over HTTP';

  const selected = nativeBrowserSmoke.test(regression);

  expect(selected).toBe(false);
});

test('smoke selection accepts the full titles supplied by Playwright', () => {
  const title =
    'angular-azure-responses integration.spec.ts streams text through the real .NET provider';

  const selected = nativeBrowserSmoke.test(title);

  expect(selected).toBe(true);
});

test('the packaged PR smoke has exactly the pinned identities in every supported combination', async () => {
  const { expectedPackageIdentities } =
    await import('../harness/package-reporter');

  const identities = expectedPackageIdentities('smoke');

  expect(identities).toHaveLength(64);
  expect(new Set(identities.map(([project]) => project)).size).toBe(8);
  expect(
    identities.every(
      ([, file, title]) =>
        file === 'integration.spec.ts' && nativeBrowserSmoke.test(title),
    ),
  ).toBe(true);
});
