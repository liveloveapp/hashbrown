import * as react from '../../hosts/react/src/recovery';
import * as angular from '../../hosts/angular/src/recovery';

for (const [framework, recovery] of Object.entries({ react, angular })) {
  test(`${framework} recognizes pending native browser work without permitting recovery execution`, () => {
    const input = {
      schemaVersion: 1,
      disposition: 'NativePendingBrowserResults',
      snapshot: { messages: [] },
    };

    const result = recovery.readRecovery(input);

    expect(recovery.recoveryBlocked(result)).toBe(true);
    expect(result.snapshot).toBeUndefined();
  });

  test(`${framework} selects the native status route only through explicit native mode`, () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
    try {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: {
          href: 'http://fixture/?recoveryUrl=http://server&recoveryMode=native',
        },
      });

      expect(recovery.recoveryEndpoint('a/b')).toBe(
        'http://server/threads/a%2Fb/native-session',
      );
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: { href: 'http://fixture/?recoveryUrl=http://server' },
      });
      expect(recovery.recoveryEndpoint('a/b')).toBe(
        'http://server/threads/a%2Fb/recovery',
      );
    } finally {
      if (original) Object.defineProperty(globalThis, 'location', original);
      else Reflect.deleteProperty(globalThis, 'location');
    }
  });
}
