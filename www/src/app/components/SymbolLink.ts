import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  Component,
  ElementRef,
  inject,
  Injector,
  Input,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, fromEvent, Observable, switchMap, takeUntil } from 'rxjs';
import {
  CanonicalReference,
  ParsedCanonicalReference,
} from '../models/api-report.models';
import { ReferenceService } from '../services/ReferenceService';
import { SYMBOl_POPOVER_REF, SymbolPopover } from './SymbolPopover';

@Component({
  selector: 'www-symbol-link',
  imports: [RouterLink],
  // prettier-ignore
  template: `@if (isPrivate) {{{ name }}} @else if (shouldUseExternalLink) {<a [href]="url" target="_blank">{{ name }}</a>} @else {<a [routerLink]="url" #internalSymbolLink>{{ name }}</a>}`,
  styles: [
    `
      a {
        color: inherit;
        text-decoration: none;
      }
    `,
  ],
})
export class SymbolLink {
  injector = inject(Injector);
  overlay = inject(Overlay);
  referenceService = inject(ReferenceService);
  internalSymbolLink =
    viewChild<ElementRef<HTMLAnchorElement>>('internalSymbolLink');
  url: string = '';
  isPrivate: boolean = true;
  parsedReference: ParsedCanonicalReference = new ParsedCanonicalReference(
    '@hashbrownai/core!Component:type',
  );
  shouldUseExternalLink: boolean = false;

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

    this.isPrivate = parsed.isPrivate;
    this.shouldUseExternalLink =
      parsed.package.startsWith('@angular') || parsed.package === 'rxjs';
    this.parsedReference = parsed;

    if (parsed.isPrivate) {
      this.url = '';
    } else if (parsed.package.startsWith('@hashbrownai')) {
      const [hashbrown, ...rest] = parsed.package.split('/');
      this.url = `/api/${rest.join('/')}/${parsed.name}`;
    } else if (parsed.package.startsWith('@angular')) {
      const [, packageName] = parsed.package.split('/');
      this.url = `https://angular.dev/api/${packageName}/${parsed.name}`;
    } else if (parsed.package === 'rxjs') {
      this.url = `https://rxjs.dev/api/index/${parsed.kind}/${parsed.name}`;
    } else {
      console.warn(`Unknown package: ${parsed.package}`);
    }
  }

  get name() {
    return this.parsedReference.name;
  }

  constructor() {
    toObservable(this.internalSymbolLink)
      .pipe(
        switchMap((linkRef) => {
          if (!linkRef) return EMPTY;

          const link = linkRef.nativeElement;

          return fromEvent(link, 'mouseenter').pipe(
            switchMap(() =>
              this.referenceService.loadFromCanonicalReference(
                this.parsedReference.referenceString,
              ),
            ),
            switchMap((apiMemberSummary) => {
              const overlay = this.overlay.create({
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

              return new Observable(() => {
                overlay.attach(componentPortal);

                let isOverLink = true;
                let isOverPopover = false;

                const onMouseLeave = () => {
                  if (!isOverLink && !isOverPopover) {
                    overlay.detach();
                  }
                };

                const linkLeaveSub = fromEvent(link, 'mouseleave').subscribe(
                  () => {
                    isOverLink = false;
                    setTimeout(onMouseLeave, 500);
                  },
                );

                const linkEnterSub = fromEvent(link, 'mouseenter').subscribe(
                  () => {
                    isOverLink = true;
                  },
                );

                const popover = overlay.overlayElement;

                const popoverEnterSub = fromEvent(
                  popover,
                  'mouseenter',
                ).subscribe(() => {
                  isOverPopover = true;
                });

                const popoverLeaveSub = fromEvent(
                  popover,
                  'mouseleave',
                ).subscribe(() => {
                  isOverPopover = false;
                  setTimeout(onMouseLeave, 0);
                });

                return () => {
                  overlay.detach();
                  linkLeaveSub.unsubscribe();
                  linkEnterSub.unsubscribe();
                  popoverEnterSub.unsubscribe();
                  popoverLeaveSub.unsubscribe();
                };
              });
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        error: console.error,
      });
  }
}
