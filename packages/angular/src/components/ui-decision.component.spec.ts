import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Decision } from '@hashbrownai/core';
import { provideHashbrown } from '../providers';
import {
  uiDecisionResource,
  type UiDecisionResourceNarrowingRef,
} from '../resources/ui-decision-resource.fn';
import { TAG_NAME_REGISTRY } from '../utils/ui-chat.helpers';
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

test('hb-ui-decision delegates narrowing results to hb-render-message', () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [UiDecisionComponent] });
  const message = {
    role: 'assistant' as const,
    content: {
      ui: [
        {
          'hb-test-weather': {
            props: { complete: true, partialValue: {}, value: {} },
          },
        },
      ],
    },
    toolCalls: [],
    [TAG_NAME_REGISTRY]: {
      'hb-test-weather': { props: {}, component: WeatherCard },
    },
  };
  const resource = {
    mode: 'narrowing',
    value: signal(message),
  } as unknown as UiDecisionResourceNarrowingRef;
  const fixture = TestBed.createComponent(UiDecisionComponent);

  fixture.componentRef.setInput('resource', resource);
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  expect(element.querySelector('hb-render-message')).not.toBeNull();
  expect(element.querySelector('hb-test-weather')?.textContent).toBe('weather');
});
