import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { createRuntime, createRuntimeFunction } from '@hashbrownai/angular';
import {
  basketArgs,
  basketResult,
  readBasket,
  runtimeScripts,
} from '../../../runtime/basket';

/** Runs visible JavaScript in QuickJS with one explicitly validated host capability. */
@Component({
  selector: 'app-runtime-demo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>JavaScript runtime</h1>
      <p>Read three basket items, then calculate the total inside QuickJS.</p>
      <p>
        The only exposed host function is readBasket. It validates the currency
        before returning a snapshot.
      </p>
      <nav aria-label="Script presets">
        <button
          type="button"
          [disabled]="running()"
          (click)="code.set(scripts.calculate)"
        >
          Calculate basket total
        </button>
        <button
          type="button"
          [disabled]="running()"
          (click)="code.set(scripts.browser)"
        >
          Try browser access
        </button>
        <button
          type="button"
          [disabled]="running()"
          (click)="code.set(scripts.invalid)"
        >
          Try invalid arguments
        </button>
      </nav>
      <label for="runtime-code">JavaScript code</label>
      <textarea
        id="runtime-code"
        rows="9"
        [value]="code()"
        [disabled]="running()"
        (input)="code.set($any($event.target).value)"
      ></textarea>
      <button type="button" [disabled]="running()" (click)="run()">
        Run in sandbox
      </button>
      @if (running()) {
        <p role="status">Running in QuickJS...</p>
      }
      <h2>Result or error</h2>
      <pre aria-live="polite" data-testid="runtime-output">{{ output() }}</pre>
      <p>
        Each run starts with a fresh context. Choose another script and run
        again after an error.
      </p>
    </main>
  `,
})
export class RuntimeDemo {
  protected readonly scripts = runtimeScripts;
  protected readonly code = signal(runtimeScripts.calculate);
  protected readonly output = signal(
    'Run the script to calculate the basket total.',
  );
  protected readonly running = signal(false);
  private readonly runtime = createRuntime({
    timeout: 1_000,
    functions: [
      createRuntimeFunction({
        name: 'readBasket',
        description:
          'Read the current basket in USD. Prices are integer cents.',
        args: basketArgs,
        result: basketResult,
        handler: async (input) => readBasket(input),
      }),
    ],
  });

  protected async run(): Promise<void> {
    this.running.set(true);
    try {
      const response: unknown = await this.runtime.run(
        this.code(),
        AbortSignal.timeout(2_000),
      );
      this.output.set(JSON.stringify(response, null, 2));
    } catch (error) {
      this.output.set(
        JSON.stringify(
          { error: error instanceof Error ? error.message : String(error) },
          null,
          2,
        ),
      );
    } finally {
      this.running.set(false);
    }
  }
}
