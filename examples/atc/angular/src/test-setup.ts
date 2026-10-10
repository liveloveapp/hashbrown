import '@angular/compiler';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

// Zoneless, like the app (main.ts), so tests only pass on signal-driven
// change detection that production also gets.
setupTestBed({ zoneless: true });
