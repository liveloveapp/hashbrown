import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CompletionSmoke } from './completion-smoke';
import { PlainSmoke } from './plain-smoke';
import { StructuredSmoke } from './structured-smoke';
import { UiSmoke } from './ui-smoke';

type Scenario = 'plain' | 'tool' | 'structured' | 'ui' | 'completion';

function readScenario(): Scenario {
  const scenario = new URL(globalThis.location.href).searchParams.get(
    'scenario',
  );

  return scenario === 'tool' ||
    scenario === 'structured' ||
    scenario === 'ui' ||
    scenario === 'completion'
    ? scenario
    : 'plain';
}

/** Minimal Angular fixture shell selected by the scenario query parameter. */
@Component({
  selector: 'runtime-smoke-root',
  standalone: true,
  imports: [PlainSmoke, StructuredSmoke, UiSmoke, CompletionSmoke],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main data-testid="fixture-ready">
      @if (scenario === 'plain' || scenario === 'tool') {
        <runtime-plain-smoke />
      } @else if (scenario === 'structured') {
        <runtime-structured-smoke />
      } @else if (scenario === 'completion') {
        <runtime-completion-smoke />
      } @else {
        <runtime-ui-smoke />
      }
    </main>
  `,
})
export class App {
  protected readonly scenario = readScenario();
}
