/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  inject,
  linkedSignal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import {
  createRuntime,
  createRuntimeFunction,
  createToolJavaScript,
  structuredCompletionResource,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { Store } from '@ngrx/store';
import { Scene } from '../../../models/scene.model';
import { selectAllLights, selectLightEntities } from '../../../store';

@Component({
  selector: 'app-scene-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDialogModule,
    MatSelectModule,
    MatSliderModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Edit' : 'Add' }} Scene</h2>
    <mat-dialog-content>
      <form [formGroup]="form">
        <mat-form-field appearance="fill">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" />
          @if (
            form.get('name')?.errors?.['required'] && form.get('name')?.touched
          ) {
            <mat-error>Name is required</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="fill">
          <mat-label>When?</mat-label>
          <input
            matInput
            formControlName="whenPrompt"
            placeholder="Every other tuesday at 7:00 PM"
          />
        </mat-form-field>
        @if (whenResource.value()) {
          <div class="when-result">
            <pre>{{ whenResource.value() | json }}</pre>
          </div>
        }

        <div formArrayName="lights">
          @for (light of lightsFormArray.controls; track $index) {
            <div [formGroupName]="$index" class="light-config">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>Light</mat-label>
                <mat-select formControlName="lightId">
                  @for (availableLight of lights(); track availableLight.id) {
                    <mat-option [value]="availableLight.id">
                      {{ availableLight.name }}
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-slider [min]="0" [max]="100" [step]="1">
                <input matSliderThumb formControlName="brightness" />
              </mat-slider>

              <button
                mat-icon-button
                color="warn"
                type="button"
                (click)="removeLight($index)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }
        </div>

        @if (predictedLights().length > 0) {
          <h5>
            <mat-icon aria-hidden="true" inline>bolt</mat-icon>
            Suggestions
          </h5>
          @for (light of predictedLights(); track light.lightId) {
            @let suggestedLight = lightEntities()[light.lightId];

            <div class="predicted-light">
              <span>{{ suggestedLight?.name }}</span>
              <span>Brightness: {{ light.brightness }}%</span>
              <button
                mat-mini-button
                type="button"
                (click)="addPredictedLightToScene(light)"
              >
                Add
              </button>
            </div>
          }
        }

        <button mat-button type="button" (click)="addLight()">Add Light</button>
      </form>

      @if (lostService()) {
        <div class="error">
          <mat-icon inline>error</mat-icon>Structured completion is not
          available.
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="undefined">Cancel</button>
      <button
        mat-raised-button
        color="primary"
        [disabled]="!form.valid"
        [mat-dialog-close]="form.value"
      >
        {{ data ? 'Save' : 'Add' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      h5 {
        display: flex;
        align-items: center;
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 400px;
        padding: 16px 0;
      }

      .light-config {
        display: flex;
        gap: 16px;
        align-items: center;
      }

      .light-config:not(:last-child) {
        margin-bottom: 8px;
      }

      .predicted-light {
        display: grid;
        gap: 8px;
        grid-template-areas: 'a a a';
        grid-auto-columns: auto 120px 50px;
      }

      mat-form-field {
        flex: 1;
      }

      .when-result {
        background-color: var(--mat-sys-surface-container-high);
        padding: 16px;
        height: 180px;
        overflow-y: auto;
        font-family: monospace;
      }

      .error {
        background-color: var(--mat-sys-error-container);
        width: fit-content;
        padding: 16px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
    `,
  ],
})
export class SceneFormDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SceneFormDialogComponent>);
  protected data = inject<Scene | undefined>(MAT_DIALOG_DATA);
  protected store = inject(Store);
  lights = this.store.selectSignal(selectAllLights);
  lightEntities = this.store.selectSignal(selectLightEntities);
  protected form = this.fb.group({
    name: ['', Validators.required],
    whenPrompt: ['', Validators.required],
    lights: this.fb.array([]),
  });
  sceneNameSignal = toSignal(this.form.get('name')!.valueChanges);
  whenPromptSignal = toSignal(this.form.get('whenPrompt')!.valueChanges);

  /**
   * --------------------------------------------------------------------------
   * Predicted Lights Resource
   * --------------------------------------------------------------------------
   */
  predictedLightsResource = structuredCompletionResource({
    model: 'gpt-oss:20b',
    debugName: 'predictedLightsResource',
    system: `
      You are an assistant that helps the user configure a lighting scene.
      The user will choose a name for the scene, and you will predict the
      lights that should be added to the scene based on the name. The input
      will be the scene name and the list of lights that are available.

      # Rules
      - Only suggest lights from the provided "availableLights" input list.
      - Pick a brightness level for each light that is appropriate for the scene.
    `,
    input: computed(() => {
      if (!this.sceneNameSignal()) return null;

      return {
        input: this.sceneNameSignal(),
        availableLights: untracked(() => this.lights()).map((light) => ({
          id: light.id,
          name: light.name,
        })),
      };
    }),
    schema: s.array(
      'The lights to add to the scene',
      s.object('A join between a light and a scene', {
        lightId: s.string('the ID of the light to add'),
        brightness: s.number('the brightness of the light from 0 to 100'),
      }),
    ),
  });

  /**
   * --------------------------------------------------------------------------
   * When Resource
   * --------------------------------------------------------------------------
   */
  whenResource = structuredCompletionResource({
    model: 'gpt-4.1',
    debugName: 'whenResource',
    input: this.whenPromptSignal,
    system: `
      You are an RFC 5545-compliant scheduling parser.

      INPUT: A short English description of a one-off or recurring event (e.g. "every other Tuesday at 7 pm", "June 27th at 6 pm and every Monday thereafter", "first Mon of each month at 09:00 PST").

      OUTPUT: **Only** a JSON object that strictly matches the schema provided by the host application.  
      • If parsing succeeds → contains the RRULE fields.  
      • If parsing fails → \`"error"\` contains a short English message.

      ─────────────────────────────────────────────────────────────────────────────
      GENERAL RULES
      1.  **Time-zone detection**  
          ▸ If the user names a zone or says “UTC”/“Z”, honour it.  
          ▸ Otherwise call the JavaScript tool \`getTimezone()\` and use that IANA ID.
      2.  **DTSTART**  
          ▸ Assume it starts today if not specified.
          ▸ Local zone: \`"TZID=<Zone>:YYYYMMDDThhmmss"\` (RFC 5545 basic).  
          ▸ UTC: \`"YYYYMMDDThhmmssZ"\`.  
      3.  **UNTIL**  
          ▸ Only emit if the user gives an explicit end.  
          ▸ When \`DTSTART\` carries \`TZID\`, convert UNTIL to UTC and append **Z**.  
      4.  **Keep DTSTART and UNTIL the same value-type** (DATE vs DATE-TIME).  
      5.  Omit any property that is \`null\` or \`undefined\`; never include extras.  
      6.  BY-lists (BYHOUR, BYMINUTE, …) are always arrays. Even single values go in arrays.  
      7.  Only include \`WKST\` if the user says something like “weeks start on Monday”.  
      8.  Reject ambiguous or unsupported input with an error. Do **not** guess.  
      9.  Resolve relative dates to the current date using the JavaScript tool

      ─────────────────────────────────────────────────────────────────────────────
      PHRASE → RULE TRANSLATIONS
      • “every &lt;day&gt; thereafter”            → DTSTART = first date/time, FREQ=WEEKLY, BYDAY = [&lt;day&gt;].  
      • “every other …” / “alternate …”        → INTERVAL = 2.  
      • “first/second/last &lt;day&gt; of month” → FREQ=MONTHLY, BYDAY = [&lt;day&gt;], BYSETPOS = [1 | 2 | -1].  
      • “for N times/days/weeks/occurrences”   → COUNT = N.  
      • “until &lt;date/time&gt;”                → UNTIL = that absolute moment.  

      ─────────────────────────────────────────────────────────────────────────────
      OUTPUT FORMAT
      \`\`\`json
      { "error": null, ... }
      \`\`\`
      Nothing else—no markdown, no prose.

      ─────────────────────────────────────────────────────────────────────────────
      EXAMPLES
      - Input: "Every other Tuesday at 7:00 PM"  
        Output:
        { "error": null,
          "freq": "WEEKLY",
          "interval": 2,
          "byday": ["TU"],
          "byhour": [19],
          "byminute": [0]
        }

      - Input: "First Monday of each month at 9am PST"  
        Output:
        { "error": null,
          "freq": "MONTHLY",
          "byday": ["MO"],
          "bysetpos": [1],
          "byhour": [9],
          "byminute": [0]
        }

      - Input: "Every day at 6:30 for 10 days"  
        Output:
        { "error": null,
          "freq": "DAILY",
          "byhour": [6],
          "byminute": [30],
          "count": 10
        }

      - Input: "March 10 2026 14:00 UTC"  
        Output:
        { "error": null,
          "dtstart": "20260310T140000Z",
          "freq": "DAILY",
          "byhour": [14],
          "byminute": [0],
          "count": 1,
          "until": "20260310T140000Z"
        }

      - Input: "Start on July 4 2025 at 9:00 AM America/Los_Angeles and repeat daily"  
        Output:
        { "error": null,
          "dtstart": "TZID=America/Los_Angeles:20250704T090000",
          "freq": "DAILY",
          "byhour": [9],
          "byminute": [0]
        }

      - Input: "June 27th at 6:00 pm and every Monday thereafter"  
        Output:
        { "error": null,
          "dtstart": "TZID=America/Los_Angeles:20250627T180000",
          "freq": "WEEKLY",
          "byday": ["MO"],
          "byhour": [18],
          "byminute": [0]
        }

      - Input: "sometime next week"  
        Output:
        { "error": "Not enough information to build a recurrence rule" }
    `,
    schema: s.object('Result', {
      error: s.anyOf([s.string('The refusal or error message'), s.nullish()]),
      freq: s.enumeration('Recurrence frequency (FREQ)', [
        'SECONDLY',
        'MINUTELY',
        'HOURLY',
        'DAILY',
        'WEEKLY',
        'MONTHLY',
        'YEARLY',
      ]),
      dtstart: s.string(
        'Start date-time (DTSTART) in RFC 5545 basic format YYYYMMDDTHHMMSS, optionally suffixed with "Z" for UTC or prefixed with "TZID=ZoneID:" for a specific time-zone',
      ),
      until: s.anyOf([
        s.nullish(),
        s.string('End date-time (UNTIL) in UTC format YYYYMMDDTHHMMSSZ'),
      ]),
      count: s.anyOf([s.nullish(), s.number('Number of occurrences (COUNT)')]),
      interval: s.anyOf([
        s.nullish(),
        s.number('Interval between recurrences (INTERVAL); default is 1'),
      ]),
      bysecond: s.anyOf([
        s.nullish(),
        s.array(
          'Seconds list (BYSECOND)',
          s.number('Second value between 0 and 59'),
        ),
      ]),
      byminute: s.anyOf([
        s.nullish(),
        s.array(
          'Minutes list (BYMINUTE)',
          s.number('Minute value between 0 and 59'),
        ),
      ]),
      byhour: s.anyOf([
        s.nullish(),
        s.array('Hours list (BYHOUR)', s.number('Hour value between 0 and 23')),
      ]),
      bymonthday: s.anyOf([
        s.nullish(),
        s.array(
          'Month days list (BYMONTHDAY)',
          s.number('Day of month between 1 and 31'),
        ),
      ]),
      byyearday: s.anyOf([
        s.nullish(),
        s.array(
          'Year days list (BYYEARDAY)',
          s.number('Day of year between -366 and 366'),
        ),
      ]),
      byweekno: s.anyOf([
        s.nullish(),
        s.array(
          'Week numbers list (BYWEEKNO)',
          s.number('ISO week number between -53 and 53'),
        ),
      ]),
      bymonth: s.anyOf([
        s.nullish(),
        s.array('By month', s.number('Month value between 1 and 12')),
      ]),
      bysetpos: s.anyOf([
        s.nullish(),
        s.array(
          'Set positions list (BYSETPOS)',
          s.number('Set position between -366 and 366'),
        ),
      ]),
      byday: s.anyOf([
        s.nullish(),
        s.array(
          'Days of week list (BYDAY) e.g. ["TU", "TH"]',
          s.string('Two-letter day code: MO, TU, WE, TH, FR, SA, SU'),
        ),
      ]),
      wkst: s.anyOf([
        s.nullish(),
        s.string('Week start day code: MO, TU, WE, TH, FR, SA, SU'),
      ]),
    }),
    tools: [
      createToolJavaScript({
        runtime: createRuntime({
          functions: [
            createRuntimeFunction({
              name: 'getTimezone',
              description: 'Get the timezone of the user',
              result: s.string('The timezone of the user'),
              handler: async () => {
                return Intl.DateTimeFormat().resolvedOptions().timeZone;
              },
            }),
            createRuntimeFunction({
              name: 'getToday',
              description:
                "Get the current date in the user's timezone as an ISO string",
              result: s.string(
                "The current date in the user's timezone as an ISO string",
              ),
              handler: async () => {
                return new Date().toISOString();
              },
            }),
          ],
        }),
      }),
    ],
  });

  protected predictedLights = linkedSignal({
    source: this.predictedLightsResource.value,
    computation: (source) => {
      if (source === undefined || source === null) return [];

      return source;
    },
  });

  protected lostService = computed(
    () => this.predictedLightsResource.status() === 'error',
  );

  protected get lightsFormArray() {
    return this.form.get('lights') as FormArray;
  }

  constructor() {
    if (this.data) {
      this.form.patchValue({
        name: this.data.name,
      });

      this.data.lights.forEach((light) => {
        this.addLight(light);
      });
    } else {
      this.addLight();
    }
  }

  protected addLight(light?: { lightId: string; brightness: number }) {
    const lightGroup = this.fb.group({
      lightId: [light?.lightId || '', Validators.required],
      brightness: [
        light?.brightness || 50,
        [Validators.required, Validators.min(0), Validators.max(100)],
      ],
    });

    this.lightsFormArray.push(lightGroup);
  }

  protected removeLight(index: number) {
    this.lightsFormArray.removeAt(index);
  }

  protected addPredictedLightToScene(light: {
    lightId: string;
    brightness: number;
  }) {
    this.lightsFormArray.push(
      this.fb.group({
        lightId: [light.lightId, Validators.required],
        brightness: [light.brightness, Validators.required],
      }),
    );

    this.predictedLights.update((predictedLights) => {
      return predictedLights.filter((p) => p.lightId !== light.lightId);
    });
  }
}
