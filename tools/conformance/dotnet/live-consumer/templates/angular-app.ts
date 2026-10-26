import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlainSmoke } from './plain-smoke';
import { StructuredSmoke } from './structured-smoke';
import { UiSmoke } from './ui-smoke';
@Component({
  selector: 'runtime-smoke-root',
  standalone: true,
  imports: [PlainSmoke, StructuredSmoke, UiSmoke],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main data-testid="fixture-ready">
    @if (scenario === 'plain' || scenario === 'tool') {
      <runtime-plain-smoke />
    } @else if (scenario === 'structured') {
      <runtime-structured-smoke />
    } @else {
      <runtime-ui-smoke />
    }
  </main>`,
})
/** Selects the cloud qualification scenario. */
export class App {
  protected readonly scenario = (() => {
    const s = new URL(location.href).searchParams.get('scenario');
    return s === 'tool' || s === 'structured' || s === 'ui' ? s : 'plain';
  })();
}
