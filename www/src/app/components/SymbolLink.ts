import { ComponentPortal } from '@angular/cdk/portal';
import {
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
import { PopoverService } from '../services/PopoverService';
import { SYMBOl_POPOVER_REF, SymbolPopover } from './SymbolPopover';

@Component({
  selector: 'www-symbol-link',
  imports: [RouterLink],
  // prettier-ignore
  template: `@if (isPrivate() || isUnknown()) {{{ displayText() }}} @else if (shouldUseExternalLink()) {<a [href]="url()" target="_blank">{{ displayText() }}</a>} @else {<a [routerLink]="url()" #internalSymbolLink>{{ displayText() }}</a>}`,
  styles: `
    a {
      color: inherit;
      text-decoration: none;
    }
  `,
})
export class SymbolLink {
  injector = inject(Injector);
  apiService = inject(ApiService);
  popoverService = inject(PopoverService);

  internalSymbolLink =
    viewChild<ElementRef<HTMLAnchorElement>>('internalSymbolLink');

  url = signal('');
  isPrivate = signal(true);
  isUnknown = signal(false);
  parsedReference = signal<ParsedCanonicalReference>(
    new ParsedCanonicalReference('@hashbrownai/core!Component:type'),
  );
  shouldUseExternalLink = signal(false);
  displayText = signal('');

  private unregisterHover: (() => void) | null = null;

  /**
   * Signal inputs aren't supported by @angular/elements, so we need
   * to use a traditional input to set the reference.
   */
  @Input({ required: true }) set reference(ref: CanonicalReference) {
    let parsed: ParsedCanonicalReference | null = null;
    try {
      parsed = new ParsedCanonicalReference(ref);
    } catch {
      // unknown canonical reference format; treat as non-link text
      this.isUnknown.set(true);
      this.displayText.set(this.displayText() || '');
      return;
    }

    this.isPrivate.set(parsed.isPrivate);
    this.shouldUseExternalLink.set(parsed.package.startsWith('@angular'));
    this.parsedReference.set(parsed);
    this.isUnknown.set(false);

    if (!this.displayText()) {
      this.displayText.set(parsed.name);
    }

    if (parsed.isPrivate) {
      this.url.set('');
    } else if (parsed.package.startsWith('@hashbrownai')) {
      const [, ...rest] = parsed.package.split('/');
      this.url.set(`/api/${rest.join('/')}/${parsed.name}`);
    } else if (parsed.package.startsWith('@angular')) {
      const [, packageName] = parsed.package.split('/');
      this.url.set(`https://angular.dev/api/${packageName}/${parsed.name}`);
    } else {
      // Not a known link target; render as plain text
      this.isUnknown.set(true);
    }
  }

  name = computed(() => this.parsedReference().name);

  @Input() set text(value: string | undefined) {
    this.displayText.set(
      value && value.length ? value : this.parsedReference().name,
    );
  }

  constructor() {
    effect((onCleanup) => {
      const linkRef = this.internalSymbolLink();
      if (!linkRef || this.isUnknown()) {
        return;
      }

      const link = linkRef.nativeElement;
      this.unregisterHover = this.popoverService.openConnectedComponentOnHover({
        origin: link,
        hoverDelayMs: 250,
        closeDelayMs: 200,
        keepOpenWhileHovered: true,
        createPortal: async () => {
          const reference = this.parsedReference().referenceString;
          const apiMemberSummary =
            await this.apiService.loadFromCanonicalReference(reference);
          const injector = Injector.create({
            parent: this.injector,
            providers: [
              {
                provide: SYMBOl_POPOVER_REF,
                useValue: apiMemberSummary,
              },
            ],
          });
          return new ComponentPortal(SymbolPopover, null, injector);
        },
      });

      onCleanup(() => {
        this.unregisterHover?.();
        this.unregisterHover = null;
      });
    });
  }
}
