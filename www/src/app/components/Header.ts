import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { BrandGitHub } from '../icons/BrandGitHub';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-header',
  imports: [
    BrandGitHub,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    RouterLink,
  ],
  template: `
    <header>
      <div class="left">
        <a routerLink="/">
          <img
            class="shake"
            src="/image/logo/brand-mark.svg"
            alt="our friendly logo that looks like a hashbrown character from an animated tv show"
            height="48"
          />
          <img src="/image/logo/word-mark.svg" alt="hashbrown" height="24" />
        </a>
      </div>
      <div class="right">
        <nav>
          <ul>
            <li>
              <a [routerLink]="docsUrl()" class="underline">docs</a>
            </li>
            <li><a routerLink="/api" class="underline">api</a></li>
            <li>
              <a [routerLink]="examplesUrl()" class="underline">example</a>
            </li>
            <li>
              <a routerLink="/enterprise" class="underline">enterprise</a>
            </li>
            <li>
              <a
                href="https://github.com/liveloveapp/hashbrown"
                target="_blank"
                class="underline"
              >
                <www-brand-github />
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div class="menu">
        <button
          matIconButton
          [matMenuTriggerFor]="menu"
          aria-label="Navigation menu"
        >
          <mat-icon>menu</mat-icon>
        </button>
        <mat-menu #menu="matMenu">
          <a mat-menu-item [routerLink]="docsUrl()" class="underline">docs</a>
          <a mat-menu-item routerLink="/api" class="underline">api</a>
          <a mat-menu-item [routerLink]="examplesUrl()" class="underline"
            >example</a
          >
          <a mat-menu-item routerLink="/enterprise" class="underline"
            >enterprise</a
          >
        </mat-menu>
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
        background: #e8a23d;
      }

      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 32px;

        > .left {
          display: flex;
          align-items: center;

          > a {
            display: flex;
            align-items: center;
            gap: 8px;
          }
        }

        > .right {
          > nav {
            > ul {
              display: flex;
              align-items: center;
              gap: 24px;

              > li {
                display: flex;
                justify-content: center;
                align-items: center;

                > a {
                  font:
                    600 16px/16px 'KefirVariable',
                    sans-serif;
                  color: #774625;
                  font-variation-settings: 'wght' 700;
                  text-decoration: underline;
                  text-decoration-color: transparent;
                  transition: text-decoration-color ease-in-out 0.2s;

                  &:hover {
                    text-decoration-color: #774625;
                  }
                }
              }
            }
          }
        }

        > .menu {
          display: none;
        }
      }

      @media print {
        header {
          display: none;
        }
      }

      @media (width < 600px) {
        header .right {
          display: none;
        }

        header .menu {
          display: block; 
        }

        .menu .a {
          font:
            600 16px/24px Poppins,
            sans-serif;
          color: #774625;
          text-decoration: underline;
          text-decoration-color: transparent;
          transition: text-decoration-color ease-in-out 0.2s;

          &:hover {
            text-decoration-color: #774625;
          }
        }}
      }

    `,
  ],
})
export class Header {
  configService = inject(ConfigService);
  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/quick`;
  });
  examplesUrl = computed(() => {
    return `/examples/${this.configService.sdk()}/ui-chat`;
  });
}
