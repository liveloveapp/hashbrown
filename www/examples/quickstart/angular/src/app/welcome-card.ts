import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A developer-owned card whose text can be supplied by the model. */
@Component({
  selector: 'app-welcome-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article aria-label="Welcome card">
      <h2>{{ title() }}</h2>
      <p>{{ message() }}</p>
    </article>
  `,
})
export class WelcomeCard {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
}
