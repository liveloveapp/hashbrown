import { Component, inject, InjectionToken, Provider } from '@angular/core';
import { exposeComponent } from './expose-component.fn';

const TOKEN = new InjectionToken<string>('expose-component-token');

@Component({
  selector: 'hb-test-expose-component',
  standalone: true,
  template: `{{ value }}`,
})
class TestExposeComponent {
  value = inject(TOKEN);
}

test('exposeComponent preserves providers in the exposed definition', () => {
  const providers: Provider[] = [{ provide: TOKEN, useValue: 'configured' }];

  const exposed = exposeComponent(TestExposeComponent, {
    description: 'Test component',
    providers,
  });

  expect(exposed.providers).toBe(providers);
});
