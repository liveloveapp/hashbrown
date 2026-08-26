import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Minimal Angular fixture shell selected by the scenario query parameter. */
@Component({
  selector: 'runtime-smoke-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main data-testid="fixture-ready">Scenario: {{ scenario }}</main>`,
})
export class App {
  protected readonly scenario =
    new URL(globalThis.location.href).searchParams.get('scenario') || 'plain';
}
