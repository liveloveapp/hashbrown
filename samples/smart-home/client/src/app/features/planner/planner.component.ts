import { Component, computed, effect, inject, signal } from '@angular/core';
import { SmartHomeService } from '../../services/smart-home.service';
import { s } from '@hashbrownai/core';
import {
  defineAsyncRuntime,
  defineFunctionWithArgs,
} from '@hashbrownai/tool-javascript';
import { lastValueFrom } from 'rxjs';
import {
  structuredChatResource,
  structuredCompletionResource,
} from '@hashbrownai/angular';

@Component({
  selector: 'app-planner',
  template: `
    <div class="input">
      <textarea
        #textarea
        [value]="plan()"
        [disabled]="isRunningPlan()"
        (input)="plan.set(textarea.value)"
      ></textarea>
    </div>
    <div class="output">
      @switch (state()) {
        @case ('no-plan') {
          <p>No plan yet</p>
        }
        @case ('in-progress') {
          <p>Creating plan...</p>
        }
        @case ('reviewing') {
          <p>Reviewing plan...</p>
        }
        @case ('done') {
          @let review = codeReview.value();

          @if (review && review.result.type === 'description') {
            <div class="description">
              @for (step of review.result.steps; track step) {
                <p>{{ step }}</p>
              }
            </div>
          }
          <button (click)="runPlan()">Run Plan</button>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 320px 1fr;
      height: 100vh;
    }

    .input {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow-y: auto;
    }

    .input textarea {
      width: 100%;
      height: 100%;
      padding: 16px;
      border-right: 1px solid #ccc;
      resize: none;
    }

    .output {
      padding: 16px;
    }

    .description {
    }

    .description p {
      margin: 0 0 8px 0;
    }
  `,
})
export class PlannerComponent {
  smartHome = inject(SmartHomeService);
  plan = signal('');
  isRunningPlan = signal(false);
  planInput = computed(() => {
    const planText = this.plan().trim();

    if (!planText) {
      return null;
    }

    return planText;
  });

  runtime = defineAsyncRuntime({
    loadVariant: () =>
      import('@jitl/quickjs-singlefile-browser-debug-asyncify').then(
        (m) => m.default,
      ),
    functions: [
      defineFunctionWithArgs({
        name: 'createLight',
        description: 'Create a light',
        input: s.string('the name of the light'),
        output: s.object('Light', {
          id: s.string('the id of the light'),
          name: s.string('the name of the light'),
        }),
        handler: (name) =>
          lastValueFrom(this.smartHome.addLight({ name, brightness: 100 })),
      }),
      defineFunctionWithArgs({
        name: 'createScene',
        description: 'Create a scene',
        input: s.object('Create Scene Params', {
          name: s.string('the name of the scene'),
          lights: s.array(
            'lights in the scene',
            s.object('Light', {
              lightId: s.string('the id of the light'),
              brightness: s.number('the brightness of the light'),
            }),
          ),
        }),
        output: s.object('Scene', {
          id: s.string('the id of the scene'),
          name: s.string('the name of the scene'),
        }),
        handler: (params) => lastValueFrom(this.smartHome.addScene(params)),
      }),
      defineFunctionWithArgs({
        name: 'createScheduledScene',
        description: 'Create a scheduled scene',
        input: s.object('Create Scheduled Scene Params', {
          sceneId: s.string('the id of the scene'),
          rrule: s.object('Recurrence Rule', {
            freq: s.enumType('Recurrence frequency (FREQ)', [
              'SECONDLY',
              'MINUTELY',
              'HOURLY',
              'DAILY',
              'WEEKLY',
              'MONTHLY',
              'YEARLY',
            ]),
            until: s.anyOf([
              s.nullType(),
              s.string('End date-time (UNTIL) in UTC format YYYYMMDDTHHMMSSZ'),
            ]),
            count: s.anyOf([
              s.nullType(),
              s.number('Number of occurrences (COUNT)'),
            ]),
            interval: s.anyOf([
              s.nullType(),
              s.number('Interval between recurrences (INTERVAL); default is 1'),
            ]),
            bysecond: s.anyOf([
              s.nullType(),
              s.array(
                'Seconds list (BYSECOND)',
                s.number('Second value between 0 and 59'),
              ),
            ]),
            byminute: s.anyOf([
              s.nullType(),
              s.array(
                'Minutes list (BYMINUTE)',
                s.number('Minute value between 0 and 59'),
              ),
            ]),
            byhour: s.anyOf([
              s.nullType(),
              s.array(
                'Hours list (BYHOUR)',
                s.number('Hour value between 0 and 23'),
              ),
            ]),
            bymonthday: s.anyOf([
              s.nullType(),
              s.array(
                'Month days list (BYMONTHDAY)',
                s.number('Day of month between 1 and 31'),
              ),
            ]),
            byyearday: s.anyOf([
              s.nullType(),
              s.array(
                'Year days list (BYYEARDAY)',
                s.number('Day of year between -366 and 366'),
              ),
            ]),
            byweekno: s.anyOf([
              s.nullType(),
              s.array(
                'Week numbers list (BYWEEKNO)',
                s.number('ISO week number between -53 and 53'),
              ),
            ]),
            bymonth: s.anyOf([
              s.nullType(),
              s.array('By month', s.number('Month value between 1 and 12')),
            ]),
            bysetpos: s.anyOf([
              s.nullType(),
              s.array(
                'Set positions list (BYSETPOS)',
                s.number('Set position between -366 and 366'),
              ),
            ]),
            byday: s.anyOf([
              s.nullType(),
              s.array(
                'Days of week list (BYDAY)',
                s.string('Two-letter day code: MO, TU, WE, TH, FR, SA, SU'),
              ),
            ]),
            wkst: s.anyOf([
              s.nullType(),
              s.string('Week start day code: MO, TU, WE, TH, FR, SA, SU'),
            ]),
          }),
        }),
        output: s.object('Scheduled Scene', {
          id: s.string('the id of the scheduled scene'),
          sceneId: s.string('the id of the scene'),
        }),
        handler: (params) => {
          console.log('createScheduledScene', params);

          return {
            id: crypto.randomUUID(),
            ...params,
          };
        },
      }),
    ],
  });
  chat = structuredChatResource({
    model: 'gpt-4.1-mini',
    debugName: 'planner-chat',
    prompt: `
      I am going to give you a description of a plan for how my
      user wants their smart home to be configured. They are
      going to give you a description of their home, the lights in
      it, and the behavior of the lights.

      Your job is to write JavaScript code that will configure their
      smart home for them. The code you write will be executed in
      a stateful JavaScript environment. It does not have access to
      the internet. It does not have access to any APIs. It does not
      have access to any external libraries. It does not have access
      to any external files. It does not have access to any external
      processes. It does not have access to any external services.

      **CRITICAL**: I am trying to implement error correction. Please
      create an obvious mistake in the code on your first attempt. I will
      then review the code and provide you with a description of the
      changes that need to be made. Then please implement it correctly.

      You will have access to the following functions:
      ${this.runtime.describe()}
    `,
    schema: s.object('The result', {
      code: s.string('The JavaScript code to run'),
    }),
  });

  code = computed(() => {
    const lastAssistantMessage = this.chat
      .value()
      .reverse()
      .find((m) => m.role === 'assistant');

    return lastAssistantMessage?.content?.code ?? null;
  });

  codeReview = structuredCompletionResource({
    model: 'gpt-4.1',
    debugName: 'planner-code-review',
    input: computed(() =>
      this.code()
        ? JSON.stringify({
            code: this.code(),
            plan: this.plan(),
          })
        : null,
    ),
    prompt: `
      I am going to give you a description of a plan for how my
      user wants their smart home to be configured. They are
      going to give you a description of their home, the lights in
      it, and the behavior of the lights.

      I will then provide you with the JavaScript code that will
      configure the smart home.

      Please review the code and make sure it is correct. If it is
      incorrect, badly formatted, or not complete, give me a description
      of the changes that need to be made. PLEASE ensure the code fully
      implements the plan.

      If the code is correct, give me a a friendly, step-by-step description
      of the code that I can display to my non-technical user. Help them
      understand how the code will implement their plan. Important: they 
      do not know that code is being generated. They only know that they
      are writing a plan for their smart home.

      Here is a description of the functions that are available to the script:
      ${this.runtime.describe()}
    `,
    schema: s.object('The result', {
      result: s.anyOf([
        s.object('A description of the code', {
          type: s.constString('description'),
          steps: s.streaming.array(
            'The steps in the code',
            s.string('The step'),
          ),
        }),
        s.object('A description of the changes that need to be made', {
          type: s.constString('changes'),
          changes: s.streaming.array(
            'The changes that need to be made to the code',
            s.string('The change'),
          ),
        }),
      ]),
    }),
  });

  state = computed(() => {
    const plan = this.planInput();

    if (!plan) {
      return 'no-plan';
    }

    if (this.chat.isLoading()) {
      return 'in-progress';
    }

    if (this.codeReview.isLoading()) {
      return 'reviewing';
    }

    return 'done';
  });

  constructor() {
    effect(() => {
      const plan = this.planInput();

      if (!plan) {
        this.chat.setMessages([]);
        return;
      }

      this.chat.setMessages([
        {
          role: 'user',
          content: plan,
        },
      ]);
    });

    effect(() => {
      const review = this.codeReview.value();

      if (!review) {
        return;
      }

      const result = review.result;

      if (result.type === 'changes') {
        this.chat.sendMessage({
          role: 'user',
          content: `Make the following changes based on an automated code review: \n${result.changes.join(
            '\n',
          )}`,
        });
      }
    });
  }

  runPlan() {
    const abortController = new AbortController();

    const code = this.code();

    if (!code) {
      return;
    }

    this.isRunningPlan.set(true);
    this.runtime.run(code, abortController.signal);
  }
}
