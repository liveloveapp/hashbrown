import { Location } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ChevronLeft } from '../icons/ChevronLeft';
import { ChevronRight } from '../icons/ChevronRight';
import { LineBreak, Link, Section } from '../models/menu.models';
import { Squircle } from './Squircle';
import { ApiService } from '../services/ApiService';

@Component({
  selector: 'www-navigation-list',
  imports: [ChevronLeft, ChevronRight, RouterLink, RouterLinkActive, Squircle],
  template: `
    <ul class="navigation-list" [class.has-active]="hasActive()">
      @for (section of sections(); track $index) {
        @if (section.kind === 'section') {
          <li class="section" [class.active]="section.active">
            <button (click)="change.emit(section)" wwwSquircle="8">
              {{ section.title }}
              <www-chevron-right />
            </button>
            @if (section.active) {
              <div class="children">
                <button (click)="change.emit(section)" wwwSquircle="8">
                  <www-chevron-left />
                  {{ section.title }}
                </button>
                <www-navigation-list
                  [level]="level()"
                  [sections]="section.children"
                  [parent]="section"
                />
              </div>
            }
          </li>
        } @else if (section.kind === 'link') {
          <li class="link">
            <a
              [routerLink]="section.url"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
              wwwSquircle="8"
              >{{ section.text }}</a
            >
          </li>
        } @else if (section.kind === 'break') {
          <li class="break"></li>
        }
      }
    </ul>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }

    .navigation-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      list-style: none;

      &.has-active {
        > li.section {
          display: none;

          &.active {
            display: grid;
          }
        }
      }

      > li {
        display: flex;

        &.section {
          display: grid;
          grid-template-columns: 1fr;
          padding: 0 16px;
        }

        a,
        button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          color: var(--chocolate-brown, #774625);
          width: 100%;
          font:
            400 13px/18px Fredoka,
            sans-serif;
          justify-content: flex-start;

          &:hover {
            background: var(--sunshine-yellow-light, #fde4ba);
          }
        }

        button {
          justify-content: space-between;
        }

        > .children {
          display: flex;
          flex-direction: column;
          gap: 4px;

          > button {
            justify-content: flex-start;
          }
        }
      }
    }

    @media (min-width: 768px) {
      .navigation-list {
        > li.section {
          grid-template-columns: repeat(2, 160px);
          column-gap: 32px;
          align-items: flex-start;
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .navigation-list {
        > li.section {
          grid-template-columns: repeat(2, 224px);
          align-items: flex-start;
        }
      }
    }

    @media screen and (min-width: 1281px) {
      .navigation-list {
        > li.section {
          grid-template-columns: repeat(2, 288px);
          align-items: flex-start;
        }
      }
    }
  `,
})
export class NavigationList {
  apiService = inject(ApiService);
  router = inject(Router);
  location = inject(Location);

  sections = input.required<(Section | Link | LineBreak)[]>();
  level = input.required<number>();
  parent = input<Section>();

  change = output<Section>();

  path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => {
        return this.location.path(false);
      }),
      startWith(this.location.path(false)),
    ),
  );

  hasActive = computed(() => {
    return this.sections().some((section) => {
      if (section.kind === 'section') {
        return section.active;
      }
      return false;
    });
  });
}
