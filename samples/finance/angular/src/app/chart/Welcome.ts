import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Squircle } from '../squircle';

interface WelcomeHighlight {
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly swatch: string;
}

const WELCOME_HIGHLIGHTS: readonly WelcomeHighlight[] = [
  {
    title: 'Prompt to chart',
    description:
      'Describe the visualization you need and watch Hashbrown vibe code the chart for you.',
    icon: 'auto_graph',
    swatch: 'var(--sunshine-yellow-light, #fde4ba)',
  },
  {
    title: 'Remix it',
    description:
      'Use remix prompts to refine colors, chart types, and annotations without leaving the canvas. You can even ask for a 1990s excel look and feel!',
    icon: 'edit',
    swatch: 'var(--gray-sage-light, #c3caae)',
  },
  {
    title: 'Tool calling',
    description:
      'The model calls a tool to get the sample dataset for the chart.',
    icon: 'handyman',
    swatch: 'var(--sunset-orange-light, #f6d1b8)',
  },
  {
    title: 'Generative UI',
    description:
      'The model generates toast notifications to inform the user of the state of the chart.',
    icon: 'developer_mode',
    swatch: 'var(--chocolate-brown-light, #e8cbc0)',
  },
];

let activeOverlayRef: OverlayRef | null = null;
let cleanupOverlayHandlers: (() => void) | null = null;

export function openWelcomeOverlay(overlay: Overlay) {
  if (activeOverlayRef?.hasAttached()) {
    return;
  }

  const overlayRef = overlay.create({
    hasBackdrop: true,
    positionStrategy: overlay
      .position()
      .global()
      .centerHorizontally()
      .centerVertically(),
    scrollStrategy: overlay.scrollStrategies.block(),
  });

  const overlayElement = overlayRef.overlayElement;
  overlayElement.classList.add('welcome-overlay');
  overlayElement.setAttribute('role', 'dialog');
  overlayElement.setAttribute('aria-modal', 'true');

  const portal = new ComponentPortal(WelcomeDialog);
  overlayRef.attach(portal);

  const close = () => closeWelcomeOverlay();

  const backdropElement = overlayRef.backdropElement;
  let removeBackdropListener = () => {
    // empty
  };

  if (backdropElement) {
    backdropElement.style.background = 'rgba(61, 60, 58, 0.24)';
    backdropElement.style.backdropFilter = 'blur(2px)';

    const onBackdropPointerDown = () => close();
    backdropElement.addEventListener('pointerdown', onBackdropPointerDown);
    removeBackdropListener = () => {
      backdropElement.removeEventListener('pointerdown', onBackdropPointerDown);
    };
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  document.addEventListener('keydown', onKeyDown);

  cleanupOverlayHandlers = () => {
    document.removeEventListener('keydown', onKeyDown);
    removeBackdropListener();
  };

  activeOverlayRef = overlayRef;
}

export function closeWelcomeOverlay() {
  const overlayRef = activeOverlayRef;
  if (!overlayRef) {
    return;
  }

  if (overlayRef.hasAttached()) {
    overlayRef.detach();
  }

  overlayRef.dispose();
  activeOverlayRef = null;

  cleanupOverlayHandlers?.();
  cleanupOverlayHandlers = null;
}

@Component({
  selector: 'app-welcome-dialog',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, Squircle],
  template: `
    <section
      class="welcome"
      appSquircle="24"
      [appSquircleBorderWidth]="2"
      appSquircleBorderColor="rgba(0, 0, 0, 0.12)"
    >
      <header>
        <div class="heading">
          <h2>Finance App</h2>
          <p>A simple finance charting app with breakfast ingredients.</p>
        </div>
        <button
          type="button"
          mat-icon-button
          aria-label="Close welcome dialog"
          (click)="close()"
        >
          <mat-icon>close</mat-icon>
        </button>
      </header>
      <p>
        Explore how Hashbrown vibe codes from a prompt to build an interactive
        chart experience using Chart.js. It's like nothing we've seen before.
      </p>
      <ul>
        @for (highlight of highlights; track highlight.title) {
          <li>
            <div
              class="icon"
              [style.background]="highlight.swatch"
              aria-hidden="true"
              appSquircle="12"
            >
              <mat-icon>{{ highlight.icon }}</mat-icon>
            </div>
            <div class="details">
              <h3>{{ highlight.title }}</h3>
              <p>{{ highlight.description }}</p>
            </div>
          </li>
        }
      </ul>
      <footer>
        <button matButton="tonal" type="button" (click)="close()">
          Start exploring
        </button>
      </footer>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    ::ng-deep .welcome-overlay {
      pointer-events: auto;
      padding: 0;
      margin: 24px;
      width: 100%;
    }

    .welcome {
      display: flex;
      flex-direction: column;
      gap: 16px;
      background: #fff;
      padding: 24px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12);
      color: var(--gray-dark, #3d3c3a);

      > header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;

        > .heading {
          display: flex;
          flex-direction: column;
          gap: 4px;

          > h2 {
            font:
              600 18px / 24px KefirVariable,
              sans-serif;
            font-variation-settings: 'wght' 600;
          }

          > p {
            margin: 0;
            font:
              400 12px / 16px Fredoka,
              sans-serif;
            color: var(--gray-dark, #3d3c3a);
            color: var(--gray, #5e5c5a);
          }
        }
      }

      > p {
        font:
          400 14px / 18px Fredoka,
          sans-serif;
        color: var(--gray, #5e5c5a);
      }

      > ul {
        display: flex;
        flex-direction: column;

        > li {
          display: grid;
          grid-template-columns: 48px 1fr;
          gap: 16px;
          align-items: center;
          padding: 16px 0;
          border-top: 1px solid rgba(0, 0, 0, 0.08);

          > .icon {
            height: 48px;
            width: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--chocolate-brown, #774625);

            mat-icon {
              font-size: 24px;
            }
          }

          > .details {
            display: flex;
            flex-direction: column;
            gap: 4px;

            > h3 {
              margin: 0;
              font:
                700 14px / 18px 'JetBrains Mono',
                monospace;
              color: var(--gray-dark, #3d3c3a);
            }

            > p {
              margin: 0;
              font:
                400 13px / 18px Fredoka,
                sans-serif;
              color: var(--gray, #5e5c5a);
            }
          }
        }
      }

      > footer {
        display: flex;
        justify-content: flex-end;
      }
    }

    @media screen and (min-width: 768px) {
      ::ng-deep .welcome-overlay {
        max-width: 568px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeDialog {
  protected readonly highlights = WELCOME_HIGHLIGHTS;

  protected close() {
    closeWelcomeOverlay();
  }
}
