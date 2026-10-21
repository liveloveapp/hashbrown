import {
  createEnvironmentInjector,
  EnvironmentInjector,
  isDevMode,
  NgZone,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ɵDevelopmentCollectorOptions } from '@hashbrownai/core';
import { RenderMessageComponent } from '../components/render-message.component';
import { provideHashbrown } from '../providers/provide-hashbrown.fn';
import { chatResource } from '../resources/chat-resource.fn';
import { TAG_NAME_REGISTRY } from '../utils/ui-chat.helpers';
import { ɵinjectDevelopmentCollector } from './collector';

const created = vi.hoisted(
  () =>
    [] as {
      options: ɵDevelopmentCollectorOptions;
      attach: ReturnType<typeof vi.fn>;
      detach: ReturnType<typeof vi.fn>;
    }[],
);
const reportMilestoneMock = vi.hoisted(() => vi.fn());

vi.mock('@hashbrownai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hashbrownai/core')>();

  return {
    ...actual,
    ɵcreateDevelopmentCollector: vi.fn(
      (options: ɵDevelopmentCollectorOptions) => {
        const detach = vi.fn();
        const attach = vi.fn(() => detach);
        created.push({ options, attach, detach });
        return { attach, dispose: vi.fn() };
      },
    ),
    ɵreportMilestone: reportMilestoneMock,
  };
});

function lastCreated() {
  return created[created.length - 1];
}

test('provideHashbrown with telemetry false yields a disabled collector', () => {
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/x', telemetry: false })],
  });

  TestBed.runInInjectionContext(() => ɵinjectDevelopmentCollector());

  expect(lastCreated().options.enabled?.()).toBe(false);
});

test('a child injector cannot re-enable a disabled parent', () => {
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/x', telemetry: false })],
  });
  const child = createEnvironmentInjector(
    [provideHashbrown({ baseUrl: '/y', telemetry: true })],
    TestBed.inject(EnvironmentInjector),
  );

  runInInjectionContext(child, () => ɵinjectDevelopmentCollector());

  expect(lastCreated().options.enabled?.()).toBe(false);
});

test('without provideHashbrown the collector is enabled and uses isDevMode', () => {
  TestBed.configureTestingModule({});

  TestBed.runInInjectionContext(() => ɵinjectDevelopmentCollector());

  const { options } = lastCreated();
  expect(options.enabled?.() ?? true).toBe(true);
  expect(options.isDevelopment).toBe(isDevMode);
  expect(options.integration).toBe('angular');
  expect(options.packageName).toBe('@hashbrownai/angular');
});

test('one provider shares one collector across injections', () => {
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/x' })],
  });

  const first = TestBed.runInInjectionContext(() =>
    ɵinjectDevelopmentCollector(),
  );
  const second = TestBed.runInInjectionContext(() =>
    ɵinjectDevelopmentCollector(),
  );

  expect(second).toBe(first);
});

test('chatResource attaches the collector and detaches on destroy', () => {
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/chat', telemetry: true })],
  });
  TestBed.runInInjectionContext(() => chatResource({ system: 'Be brief.' }));
  const { attach, detach } = lastCreated();

  TestBed.resetTestingModule();

  expect(attach).toHaveBeenCalledTimes(1);
  expect(detach).toHaveBeenCalledTimes(1);
});

test('rendering a component reports component.first_rendered once', () => {
  reportMilestoneMock.mockReset();
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;
  class CardComponent {}
  const message = {
    role: 'assistant' as const,
    content: {
      ui: [
        {
          Card: {
            props: { complete: true, partialValue: {}, value: {} },
          },
        },
      ],
    },
    toolCalls: [],
    [TAG_NAME_REGISTRY]: {
      Card: { props: {}, component: CardComponent },
    },
  };
  fixture.componentRef.setInput('message', message);

  component.getRenderableComponent(message.content.ui[0]);
  component.getRenderableComponent({ ...message.content.ui[0] });

  expect(reportMilestoneMock).toHaveBeenCalledTimes(1);
  expect(reportMilestoneMock).toHaveBeenCalledWith(
    expect.anything(),
    'component.first_rendered',
  );
});

test('the collector runs its work outside the Angular zone', () => {
  TestBed.configureTestingModule({
    providers: [provideHashbrown({ baseUrl: '/zone' })],
  });
  const zone = TestBed.inject(NgZone);
  const outside = vi.spyOn(zone, 'runOutsideAngular');
  const work = vi.fn();
  TestBed.runInInjectionContext(() => ɵinjectDevelopmentCollector());

  lastCreated().options.run?.(work);

  expect(outside).toHaveBeenCalledWith(work);
  expect(work).toHaveBeenCalledTimes(1);
});
