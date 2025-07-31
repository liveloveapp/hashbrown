import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { BrandGitHub } from '../icons/BrandGitHub';
import { ConfigService } from '../services/ConfigService';
import { Menu } from '../icons/Menu';

@Component({
  selector: 'www-header',
  imports: [BrandGitHub, Menu, RouterLink],
  template: `
    <header>
      <div class="left">
        <a routerLink="/">
          <img src="/image/logo/word-mark.svg" alt="hashbrown" height="24" />
        </a>
      </div>
      <div class="right">
        <nav>
          <ul>
            <li>
              <a routerLink="/">home</a>
            </li>
            <li>
              <a [routerLink]="docsUrl()">docs</a>
            </li>
            <li>
              <a routerLink="/products/workshops">workshops</a>
            </li>
            <li>
              <a routerLink="/blog">blog</a>
            </li>
            <li>
              <a
                href="https://github.com/liveloveapp/hashbrown"
                target="_blank"
                class="github"
              >
                <www-brand-github height="16" width="16" />
                github
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div class="menu">
        <button
          #menuTrigger
          (click)="toggleMenu()"
          aria-label="Navigation menu"
          class="menu-button"
        >
          <www-menu />
        </button>
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: flex;
      }

      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 24px 32px;
        width: 100%;
        max-width: 1080px;
        margin: 0 auto;

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
                  display: flex;
                  align-items: center;
                  gap: 4px;
                  color: var(--gray, #5e5c5a);
                  font:
                    500 16px/140% Fredoka,
                    sans-serif;

                  &:hover {
                    font-weight: 700;
                    color: var(--sunset-orange, #e88c4d);
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

      .menu-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: none;
        background: none;
        cursor: pointer;
        color: var(--gray, #5e5c5a);
        border-radius: 4px;
        transition: background-color 0.2s ease;

        &:hover {
          background-color: rgba(0, 0, 0, 0.04);
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
      }
    `,
  ],
})
export class Header {
  configService = inject(ConfigService);
  overlay = inject(Overlay);
  menuTrigger = viewChild.required<ElementRef<HTMLElement>>('menuTrigger');

  private overlayRef: OverlayRef | null = null;
  private menuOpen = signal(false);

  docsUrl = computed(() => {
    return `/docs/${this.configService.sdk()}/start/quick`;
  });

  examplesUrl = computed(() => {
    return `/examples/${this.configService.sdk()}/ui-chat`;
  });

  toggleMenu() {
    if (this.menuOpen()) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  private openMenu() {
    if (this.overlayRef) {
      return;
    }

    const triggerElement = this.menuTrigger().nativeElement;
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(triggerElement)
      .withPositions([
        {
          originX: 'end',
          originY: 'bottom',
          overlayX: 'end',
          overlayY: 'top',
          offsetY: 8,
        },
      ]);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.close(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    });

    const menuPortal = new ComponentPortal(MobileMenuComponent);
    const menuComponentRef = this.overlayRef.attach(menuPortal);

    // Pass data to the menu component
    menuComponentRef.instance.docsUrl = this.docsUrl();
    menuComponentRef.instance.examplesUrl = this.examplesUrl();
    menuComponentRef.instance.closeMenu = () => this.closeMenu();

    this.overlayRef.backdropClick().subscribe(() => {
      this.closeMenu();
    });

    this.menuOpen.set(true);
  }

  private closeMenu() {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
      this.menuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.menuOpen()) {
      this.closeMenu();
    }
  }
}

// Mobile Menu Component
@Component({
  selector: 'www-mobile-menu',
  imports: [RouterLink],
  template: `
    <div class="mobile-menu">
      <a [routerLink]="docsUrl" (click)="closeMenu()" class="menu-item">
        docs
      </a>
      <a routerLink="/api" (click)="closeMenu()" class="menu-item"> api </a>
      <a [routerLink]="examplesUrl" (click)="closeMenu()" class="menu-item">
        example
      </a>
      <a routerLink="/products" (click)="closeMenu()" class="menu-item">
        products
      </a>
    </div>
  `,
  styles: `
    .mobile-menu {
      background: #fff;
      border-radius: 8px;
      box-shadow:
        0 10px 15px -3px rgba(0, 0, 0, 0.16),
        0 4px 6px -4px rgba(0, 0, 0, 0.16);
      padding: 8px 0;
      min-width: 200px;
    }

    .menu-item {
      display: block;
      padding: 12px 16px;
      color: #774625;
      text-decoration: none;
      font:
        600 16px/24px Poppins,
        sans-serif;
      transition: background-color 0.2s ease;

      &:hover {
        background-color: rgba(119, 70, 37, 0.04);
        text-decoration: underline;
        text-decoration-color: #774625;
      }
    }
  `,
})
class MobileMenuComponent {
  docsUrl = '';
  examplesUrl = '';
  closeMenu = () => {
    // This will be set by the parent component
  };
}
