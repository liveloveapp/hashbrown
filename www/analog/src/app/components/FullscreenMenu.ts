import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectedPosition,
  FullscreenOverlayContainer,
  Overlay,
  OverlayContainer,
} from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { Close } from '../icons/Close';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-fullscreen-menu',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, Close, Squircle],
  providers: [
    { provide: OverlayContainer, useClass: FullscreenOverlayContainer },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      (click)="onClick()"
      [attr.aria-controls]="menuId"
      [attr.aria-expanded]="open() ? 'true' : 'false'"
      [attr.aria-haspopup]="'menu'"
      [wwwSquircle]="squircle()"
      #trigger="cdkOverlayOrigin"
      cdkOverlayOrigin
      type="button"
    >
      <ng-content select="label"></ng-content>
    </button>
    <ng-template
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayOrigin]="trigger"
      [cdkConnectedOverlayPanelClass]="'fullscreen-panel'"
      [cdkConnectedOverlayPositions]="positions()"
      [cdkConnectedOverlayScrollStrategy]="scrollStrategy"
      cdkConnectedOverlay
    >
      <div
        [attr.id]="menuId"
        class="fullscreen-content"
        role="menu"
        tabindex="-1"
      >
        <button (click)="onClick()"><www-close /></button>
        <ng-content select="[content]"></ng-content>
      </div>
    </ng-template>
  `,
  styles: [
    `
      :host {
        position: relative;
        display: inline-block;
      }

      button {
        display: flex;
        align-items: center;
        gap: 4px;
        border: none;
        background: none;
        cursor: pointer;

        > label {
          cursor: pointer;
        }
      }

      ::ng-deep.fullscreen-panel {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        transform: none !important;
        overflow: hidden;
        display: flex;
      }

      ::ng-deep .fullscreen-content {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;

        > button {
          position: absolute;
          top: 16px;
          right: 16px;
          z-index: 1;
        }
      }
    `,
  ],
})
export class FullscreenMenu {
  overlay = inject(Overlay);
  router = inject(Router);

  squircle = input<string>('8');
  positions = input<ConnectedPosition[]>([
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 4,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -4,
    },
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 4,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -4,
    },
  ]);

  open = signal(false);
  menuId = 'www-fullscreen-' + Math.random().toString(36).slice(2);
  scrollStrategy = this.overlay.scrollStrategies.block();

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.open.set(false);
      });
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.open()) {
      this.open.set(false);
    }
  }

  onClick() {
    this.open.update((open) => !open);
  }
}
