import { Location } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith, tap } from 'rxjs';
import { ChevronRight } from '../icons/ChevronRight';
import { Section } from '../models/menu.models';
import { PageLink } from './PageLink';

@Component({
  selector: 'www-page-section',
  imports: [PageLink, ChevronRight],
  template: `
    <section>
      @if (collapsible()) {
        <header>
          <button (click)="toggleSection()">
            <www-chevron-right />
            <span>{{ section().title }}</span>
          </button>
        </header>
      }
      @if (!collapsible() || isOpen()) {
        <div class="section-content">
          @for (child of section().children; track $index) {
            @if (child.kind === 'link') {
              <www-page-link [url]="child.url">{{ child.text }}</www-page-link>
            } @else if (child.kind === 'break') {
              <hr />
            } @else {
              <www-page-section [section]="child"></www-page-section>
            }
          }
        </div>
      }
    </section>
  `,
  host: {
    '[class.open]': 'isOpen()',
    '[class.collapsible]': 'collapsible()',
    '[class.hasActiveUrl]': 'hasActiveUrl()',
  },
  styles: [
    `
      .section-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 3px;
      }

      :host(.collapsible) .section-content {
        border-left: 1px solid #7d542f;
        padding: 4px 16px;
        margin-left: 12px;
      }

      :host(.open) > section > header mat-icon {
        transform: rotate(90deg);
      }

      :host(.hasActiveUrl) > section > .section-content {
        border-color: #7d542f;
      }

      section header button {
        font: 600 14px/16px sans-serif;
        margin: 6px 0 3px;
        font-size: 16px;
        display: flex;
        gap: 4px;
        align-items: center;
        padding: 0;
        outline: none;
        border: none;
        background: none;
        cursor: pointer;
        width: 100%;
      }

      section header button span {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      :host(.hasActiveUrl) > section > header > button {
        color: #fbbb52;
      }

      section :host {
        display: flex;
        flex-direction: column;
      }

      section :host header button {
        font-size: 14px;
      }

      hr {
        border: none;
        border-top: 1px solid rgba(61, 60, 58, 0.88);
        margin: 16px 0;
        width: 100%;
      }
    `,
  ],
})
export class PageSection {
  router = inject(Router);
  location = inject(Location);
  section = input.required<Section>();
  collapsible = input<boolean>(true);
  isToggledOpen = signal(false);
  path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      tap(() => this.isToggledOpen.set(false)),
      map(() => {
        return this.location.path(false);
      }),
      startWith(this.location.path(false)),
    ),
  );
  urls = computed(() => {
    const collectUrls = (section: Section): string[] => {
      const urls: string[] = [];
      for (const child of section.children) {
        if (child.kind === 'link') {
          urls.push(child.url);
        } else if (child.kind === 'section') {
          urls.push(...collectUrls(child));
        }
      }
      return urls;
    };

    return collectUrls(this.section());
  });
  hasActiveUrl = computed(() => {
    const path = this.path();

    if (!path) {
      return false;
    }

    return this.urls().some((url) => path === url);
  });
  isOpen = computed(() => this.isToggledOpen() || this.hasActiveUrl());

  toggleSection() {
    this.isToggledOpen.update((open) => !open);
  }
}
