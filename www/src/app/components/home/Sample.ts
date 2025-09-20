import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  ViewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SampleBusService } from '../../services/SampleBusService';
import { DropdownMenu } from '../DropDownMenu';
import { Squircle } from '../Squircle';

@Component({
  selector: 'www-sample',
  imports: [Squircle, DropdownMenu],
  template: `
    <div class="bleed">
      <div
        class="player"
        wwwSquircle="16"
        [wwwSquircleBorderWidth]="4"
        wwwSquircleBorderColor="var(--gray, #5e5c5a)"
      >
        <iframe
          #frame
          [src]="safeIframeUrl()"
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-forms allow-same-origin"
        ></iframe>
      </div>

      <div class="controls">
        <button (click)="start()">Start</button>
        <button (click)="pause()">Pause</button>
        <button (click)="restart()">Restart</button>
        <www-dropdown-menu [openMode]="'click'" [squircle]="'8'">
          <label>Speed: {{ speed() }}x</label>
          <div content class="menu">
            @for (opt of speedOptions; track opt) {
              <button
                type="button"
                (click)="selectSpeed(opt)"
                [class.selected]="opt === speed()"
              >
                {{ opt }}x
              </button>
            }
          </div>
        </www-dropdown-menu>
        <span>
          @if (status()) {
            {{ status() }}
          }
        </span>
        <span>
          @if (progress()) {
            {{ progress()!.stepIndex + 1 }}/{{ progress()!.total }}
          }
        </span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      background: #fff;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 48px;
      padding: 16px;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;

      > .player {
        height: 860px;
        width: 100%;

        > iframe {
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
      }

      > .header {
        display: flex;
        flex-direction: column;
        gap: 8px;

        > p {
          color: var(--gray-dark, #3d3c3a);
          font:
            400 15px/24px Fredoka,
            sans-serif;
        }

        > h2 {
          color: rgba(0, 0, 0, 0.56);
          font:
            750 32px/40px KefirVariable,
            sans-serif;
          font-variation-settings: 'wght' 750;
        }
      }
    }

    iframe {
      flex: 1 1 auto;
    }

    .controls {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px;
    }

    .controls > button {
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid rgba(0, 0, 0, 0.12);
      cursor: pointer;
    }

    .menu {
      display: flex;
      flex-direction: column;
      gap: 4px;
      background: #fff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      padding: 8px;
      border-radius: 8px;
    }

    .menu > button {
      appearance: none;
      background: none;
      border: none;
      text-align: left;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
    }

    .menu > button:hover {
      background: rgba(0, 0, 0, 0.04);
    }

    .menu > button.selected {
      background: rgba(0, 0, 0, 0.08);
      font-weight: 600;
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 64px;
      }
    }
  `,
})
export class Sample implements AfterViewInit {
  private platformId = inject(PLATFORM_ID);
  private bus = inject(SampleBusService);
  private sanitizer = inject(DomSanitizer);

  @ViewChild('frame', { static: true })
  frameRef!: ElementRef<HTMLIFrameElement>;

  iframeUrl = signal<string>(
    (globalThis as any).import?.meta?.env?.VITE_SAMPLE_IFRAME_URL ??
      'http://localhost:4900/',
  );
  safeIframeUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.iframeUrl()),
  );
  speed = signal<number>(1);
  speedOptions = [0.25, 0.5, 1, 1.5, 2];
  status = computed(() => this.bus.status());
  progress = computed(() => this.bus.progress());

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const iframeEl = this.frameRef.nativeElement;
    this.bus.connect(iframeEl, this.iframeUrl());
  }

  start() {
    this.bus.start({ speed: this.speed() });
  }
  pause() {
    this.bus.pause();
  }
  restart() {
    this.bus.restart({ speed: this.speed() });
  }
  selectSpeed(v: number) {
    this.speed.set(v);
    this.bus.setSpeed(v);
  }
}
