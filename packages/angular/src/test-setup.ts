import '@angular/compiler';
import '@analogjs/vitest-angular/setup-zone';

import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { getTestBed } from '@angular/core/testing';

getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting(),
);

// Keep specs that create real chat runtimes from sending development
// collection requests; growth specs mock the collector instead.
(
  window as unknown as { __HASHBROWN_TELEMETRY_DISABLED__?: boolean }
).__HASHBROWN_TELEMETRY_DISABLED__ = true;
