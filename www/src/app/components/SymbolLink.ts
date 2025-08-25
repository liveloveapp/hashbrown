import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  Input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CanonicalReference,
  ParsedCanonicalReference,
} from '../models/api-report.models';
import { ApiService } from '../services/ApiService';
import { SYMBOl_POPOVER_REF, SymbolPopover } from './SymbolPopover';

@Component({
  selector: 'www-symbol-link',
  imports: [RouterLink],
  // prettier-ignore
  template: `@if (isPrivate()) {{{ name() }}} @else if (shouldUseExternalLink()) {<a [href]="url()" target="_blank">{{ name() }}</a>} @else {<a [routerLink]="url()" #internalSymbolLink>{{ name() }}</a>}`,
  styles: [
    `
      a {
        color: inherit;
        text-decoration: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SymbolLink {
  injector = inject(Injector);
  overlay = inject(Overlay);
  apiService = inject(ApiService);
  internalSymbolLink =
    viewChild<ElementRef<HTMLAnchorElement>>('internalSymbolLink');
  url = signal('');
  isPrivate = signal(true);
  parsedReference = signal<ParsedCanonicalReference>(
    new ParsedCanonicalReference('@hashbrownai/core!Component:type'),
  );
  shouldUseExternalLink = signal(false);

  private cleanupPopover: (() => void) | null = null;

  /**
   * Signal inputs aren't supported by @angular/elements, so we need
   * to use a traditional input to set the reference.
   */
  @Input({ required: true }) set reference(ref: CanonicalReference) {
    let parsed: ParsedCanonicalReference;
    try {
      parsed = new ParsedCanonicalReference(ref);
    } catch (e) {
      console.warn(`Invalid reference: ${ref}`, e);
      return;
    }

    this.isPrivate.set(parsed.isPrivate);
    this.shouldUseExternalLink.set(parsed.package.startsWith('@angular'));
    this.parsedReference.set(parsed);

    if (parsed.isPrivate) {
      this.url.set('');
    } else if (parsed.package.startsWith('@hashbrownai')) {
      const [, ...rest] = parsed.package.split('/');
      this.url.set(`/api/${rest.join('/')}/${parsed.name}`);
    } else if (parsed.package.startsWith('@angular')) {
      const [, packageName] = parsed.package.split('/');
      this.url.set(`https://angular.dev/api/${packageName}/${parsed.name}`);
    } else {
      console.warn(`Unknown package: ${parsed.package}`);
    }
  }

  name = computed(() => this.parsedReference().name);

  constructor() {
    effect((onCleanup) => {
      const linkRef = this.internalSymbolLink();
      if (!linkRef) {
        return;
      }

      const link = linkRef.nativeElement;
      const handleMouseEnter = () => this.openPopover(link);
      link.addEventListener('mouseenter', handleMouseEnter);

      onCleanup(() => {
        link.removeEventListener('mouseenter', handleMouseEnter);
        this.cleanupPopover?.();
        this.cleanupPopover = null;
      });
    });
  }

  private openPopover(link: HTMLAnchorElement) {
    this.cleanupPopover?.();
    this.cleanupPopover = null;

    const reference = this.parsedReference().referenceString;
    this.apiService
      .loadFromCanonicalReference(reference)
      .then((apiMemberSummary) => {
        const overlayRef = this.overlay.create({
          positionStrategy: this.overlay
            .position()
            .flexibleConnectedTo(link)
            .withPositions([
              {
                originX: 'center',
                originY: 'bottom',
                overlayX: 'center',
                overlayY: 'top',
              },
            ]),
          hasBackdrop: false,
          scrollStrategy: this.overlay.scrollStrategies.close(),
        });

        const injector = Injector.create({
          parent: this.injector,
          providers: [
            {
              provide: SYMBOl_POPOVER_REF,
              useValue: apiMemberSummary,
            },
          ],
        });

        const componentPortal = new ComponentPortal(
          SymbolPopover,
          null,
          injector,
        );
        overlayRef.attach(componentPortal);

        let isOverLink = true;
        let isOverPopover = false;

        const onMouseLeave = () => {
          if (!isOverLink && !isOverPopover) {
            overlayRef.detach();
          }
        };

        const handleLinkLeave = () => {
          isOverLink = false;
          setTimeout(onMouseLeave, 200);
        };
        const handleLinkEnter = () => {
          isOverLink = true;
        };
        link.addEventListener('mouseleave', handleLinkLeave);
        link.addEventListener('mouseenter', handleLinkEnter);

        const popover = overlayRef.overlayElement;
        const handlePopoverEnter = () => {
          isOverPopover = true;
        };
        const handlePopoverLeave = () => {
          isOverPopover = false;
          setTimeout(onMouseLeave, 0);
        };
        popover.addEventListener('mouseenter', handlePopoverEnter);
        popover.addEventListener('mouseleave', handlePopoverLeave);

        this.cleanupPopover = () => {
          try {
            overlayRef.detach();
          } catch {
            // ignore
          }
          link.removeEventListener('mouseleave', handleLinkLeave);
          link.removeEventListener('mouseenter', handleLinkEnter);
          popover.removeEventListener('mouseenter', handlePopoverEnter);
          popover.removeEventListener('mouseleave', handlePopoverLeave);
        };
      })
      .catch((err) => {
        console.error(err);
      });
  }
}
