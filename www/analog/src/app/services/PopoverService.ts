import { inject, Injectable, signal } from '@angular/core';
import { ConnectedPosition, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';

export interface HoverPopoverConfig {
  origin: HTMLElement;
  createPortal: () =>
    | Promise<ComponentPortal<unknown>>
    | ComponentPortal<unknown>;
  positions?: ConnectedPosition[];
  hoverDelayMs?: number;
  closeDelayMs?: number;
  keepOpenWhileHovered?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PopoverService {
  private readonly overlay = inject(Overlay);
  private activeOverlayRef = signal<OverlayRef | null>(null);
  private activeOrigin = signal<HTMLElement | null>(null);
  private activeOverlayCleanup: (() => void) | null = null;

  private registrations = new Map<
    HTMLElement,
    {
      handleEnter: () => void;
      handleLeave: () => void;
      cancelPending: () => void;
    }
  >();

  closeActive(): void {
    try {
      this.activeOverlayCleanup?.();
      this.activeOverlayCleanup = null;
      const ref = this.activeOverlayRef();
      ref?.detach();
    } catch {
      // ignore
    } finally {
      this.activeOverlayRef.set(null);
      this.activeOrigin.set(null);
    }
  }

  openConnectedComponentOnHover(config: HoverPopoverConfig): () => void {
    const {
      origin,
      createPortal,
      hoverDelayMs = 250,
      closeDelayMs = 200,
      keepOpenWhileHovered = true,
    } = config;

    const positions = config.positions ?? this.getDefaultPositions();

    if (this.registrations.has(origin)) {
      this.unregister(origin);
    }

    let hoverTimerId: number | null = null;
    let isHovering = false;

    const cancelPending = () => {
      if (hoverTimerId !== null) {
        clearTimeout(hoverTimerId);
        hoverTimerId = null;
      }
    };

    const handleEnter = () => {
      isHovering = true;
      if (this.activeOverlayRef() && this.activeOrigin() === origin) {
        return;
      }
      cancelPending();
      hoverTimerId = window.setTimeout(async () => {
        hoverTimerId = null;
        if (!isHovering) {
          return;
        }
        const portal = await Promise.resolve(createPortal());
        if (!isHovering) {
          return;
        }

        this.closeActive();

        const positionStrategy = this.overlay
          .position()
          .flexibleConnectedTo(origin)
          .withPositions(positions);

        const overlayRef = this.overlay.create({
          positionStrategy,
          hasBackdrop: false,
          scrollStrategy: this.overlay.scrollStrategies.block(),
        });

        overlayRef.attach(portal);
        this.activeOverlayRef.set(overlayRef);
        this.activeOrigin.set(origin);

        let isOverOrigin = true;
        let isOverPopover = false;
        const popover = overlayRef.overlayElement;

        const closeIfNotHovered = () => {
          if (!isOverOrigin && !isOverPopover) {
            this.closeActive();
          }
        };

        const onOriginEnter = () => {
          isOverOrigin = true;
        };
        const onOriginLeave = () => {
          isOverOrigin = false;
          window.setTimeout(closeIfNotHovered, closeDelayMs);
        };
        const onPopoverEnter = () => {
          isOverPopover = true;
        };
        const onPopoverLeave = () => {
          isOverPopover = false;
          window.setTimeout(closeIfNotHovered, 0);
        };

        if (keepOpenWhileHovered) {
          origin.addEventListener('mouseenter', onOriginEnter);
          origin.addEventListener('mouseleave', onOriginLeave);
          popover.addEventListener('mouseenter', onPopoverEnter);
          popover.addEventListener('mouseleave', onPopoverLeave);
        }

        this.activeOverlayCleanup = () => {
          try {
            if (keepOpenWhileHovered) {
              origin.removeEventListener('mouseenter', onOriginEnter);
              origin.removeEventListener('mouseleave', onOriginLeave);
              popover.removeEventListener('mouseenter', onPopoverEnter);
              popover.removeEventListener('mouseleave', onPopoverLeave);
            }
          } catch {
            // ignore
          }
        };
      }, hoverDelayMs);
    };

    const handleLeave = () => {
      isHovering = false;
      cancelPending();
    };

    origin.addEventListener('mouseenter', handleEnter);
    origin.addEventListener('mouseleave', handleLeave);
    this.registrations.set(origin, { handleEnter, handleLeave, cancelPending });

    return () => this.unregister(origin);
  }

  private unregister(origin: HTMLElement): void {
    const state = this.registrations.get(origin);
    if (!state) {
      return;
    }
    try {
      origin.removeEventListener('mouseenter', state.handleEnter);
      origin.removeEventListener('mouseleave', state.handleLeave);
    } catch {
      // ignore
    }
    state.cancelPending();
    if (this.activeOrigin() === origin) {
      this.closeActive();
    }
    this.registrations.delete(origin);
  }

  private getDefaultPositions(): ConnectedPosition[] {
    return [
      // above
      {
        originX: 'center',
        originY: 'top',
        overlayX: 'center',
        overlayY: 'bottom',
        offsetY: -8,
      },
      // below
      {
        originX: 'center',
        originY: 'bottom',
        overlayX: 'center',
        overlayY: 'top',
        offsetY: 8,
      },
      // right
      {
        originX: 'end',
        originY: 'center',
        overlayX: 'start',
        overlayY: 'center',
        offsetX: 8,
      },
      // left
      {
        originX: 'start',
        originY: 'center',
        overlayX: 'end',
        overlayY: 'center',
        offsetX: -8,
      },
    ];
  }
}
