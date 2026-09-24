import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../services/ConfigService';
import { CAPABILITIES, Capability } from './home.content';

@Component({
  selector: 'www-capabilities',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <h2>Features</h2>
    </header>
    <div class="grid">
      @for (capability of capabilities; track capability.title) {
        <article>
          <h3>{{ capability.title }}</h3>
          <p>{{ capability.body }}</p>
          <a
            [routerLink]="docsLink(capability)"
            [attr.aria-label]="'Read the docs: ' + capability.title"
            >Read the docs</a
          >
        </article>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 0 72px;
    }

    header {
      max-width: 640px;
      margin-bottom: 32px;
    }

    h2 {
      font: 800 40px/1.08 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    header p {
      margin-top: 12px;
      font:
        400 17px/1.5 'Fredoka',
        sans-serif;
      color: var(--gray);
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }

    article {
      padding: 22px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 18px;
      background: #fff;
    }

    h3 {
      margin-bottom: 6px;
      font: 700 20px/1.2 var(--font-heading);
      letter-spacing: -0.02em;
      color: var(--chocolate-brown);
    }

    p {
      margin-bottom: 12px;
      font:
        400 15px/1.5 'Fredoka',
        sans-serif;
      color: var(--gray);
    }

    a {
      display: inline-block;
      margin-top: 12px;
      font:
        500 14px/1 'Fredoka',
        sans-serif;
      color: var(--chocolate-brown);
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    @media screen and (min-width: 768px) {
      .grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media screen and (min-width: 1024px) {
      .grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class Capabilities {
  private readonly config = inject(ConfigService);
  readonly capabilities = CAPABILITIES;

  docsLink(capability: Capability): string {
    return `/docs/${this.config.sdk()}/${capability.docsPath.join('/')}`;
  }
}
