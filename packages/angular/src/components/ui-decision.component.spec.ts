import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Decision } from '@hashbrownai/core';
import { provideHashbrown } from '../providers';
import { uiDecisionResource } from '../resources/ui-decision-resource.fn';
import { UiDecisionComponent } from './ui-decision.component';

@Component({ selector: 'hb-test-flight', template: 'flight {{ tail() }}' })
class FlightCard {
  tail = input('');
}

@Component({ selector: 'hb-test-airport', template: 'airport {{ code() }}' })
class AirportCard {
  code = input('');
}

@Component({ selector: 'hb-test-weather', template: 'weather' })
class WeatherCard {}

function multiResponse(
  probabilities: Record<string, number>,
): Decision.Response {
  return {
    kind: 'hashbrown.decision',
    version: 1,
    value: Object.fromEntries(
      Object.entries(probabilities).map(([id, p]) => [id, p >= 0.5]),
    ),
    meta: Object.fromEntries(
      Object.entries(probabilities).map(([id, p]) => [id, { probability: p }]),
    ),
  };
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  TestBed.tick();
}

test('hb-ui-decision renders chosen candidates in order with their inputs', async () => {
  const transport: Decision.Transport = async () =>
    multiResponse({ flight: 0.6, airport: 0.95, weather: 0.1 });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UiDecisionComponent],
    providers: [provideHashbrown({ decision: { transport } })],
  });
  const resource = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('N123 near KSFO'),
      select: { max: 2 },
      candidates: [
        {
          id: 'flight',
          description: 'One aircraft',
          component: FlightCard,
          inputs: { tail: 'N123' },
        },
        {
          id: 'airport',
          description: 'An airport',
          component: AirportCard,
          inputs: { code: 'KSFO' },
        },
        { id: 'weather', description: 'The weather', component: WeatherCard },
      ],
    }),
  );
  const fixture = TestBed.createComponent(UiDecisionComponent);
  fixture.componentRef.setInput('resource', resource);

  await settle();
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const rendered = Array.from(element.children).map((child) => [
    child.tagName.toLowerCase(),
    child.textContent?.trim(),
  ]);
  expect(rendered).toEqual([
    ['hb-test-airport', 'airport KSFO'],
    ['hb-test-flight', 'flight N123'],
  ]);
});

test('hb-ui-decision re-renders a chosen candidate when its signal inputs change', async () => {
  let requests = 0;
  const transport: Decision.Transport = async () => {
    requests++;
    return multiResponse({ flight: 0.9, airport: 0.1 });
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UiDecisionComponent],
    providers: [provideHashbrown({ decision: { transport } })],
  });
  const tail = signal<Record<string, unknown>>({ tail: 'N123' });
  const resource = TestBed.runInInjectionContext(() =>
    uiDecisionResource({
      input: signal('N123'),
      select: { max: 1 },
      candidates: [
        {
          id: 'flight',
          description: 'One aircraft',
          component: FlightCard,
          inputs: tail,
        },
        {
          id: 'airport',
          description: 'An airport',
          component: AirportCard,
          inputs: { code: 'KSFO' },
        },
      ],
    }),
  );
  const fixture = TestBed.createComponent(UiDecisionComponent);
  fixture.componentRef.setInput('resource', resource);
  await settle();
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const card = element.querySelector('hb-test-flight');
  const before = card?.textContent?.trim();

  tail.set({ tail: 'N456' });
  await settle();
  fixture.detectChanges();

  expect(before).toBe('flight N123');
  expect(element.querySelector('hb-test-flight')).toBe(card);
  expect(card?.textContent?.trim()).toBe('flight N456');
  expect(requests).toBe(1);
});
