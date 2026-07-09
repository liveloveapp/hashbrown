import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SafeResourceUrl } from '@angular/platform-browser';
import { ConfigService } from '../../services/ConfigService';
import { Book } from '../../icons/Book';
import { PlayerPlay } from '../../icons/PlayerPlay';
import { Squircle } from '../Squircle';

@Component({
  selector: 'www-feature',
  imports: [RouterLink, Book, Squircle, PlayerPlay],
  template: `
    @if (preview()) {
      <img
        src="/image/landing-page/features/coming-soon.svg"
        alt="Coming Soon"
        class="coming-soon"
      />
    }

    <div class="content">
      <div class="icon">
        <img [src]="imageUrl()" alt="Feature Icon" />
      </div>
      <div class="text">
        <h3>{{ title() }}</h3>
        <p>{{ description() }}</p>
      </div>
    </div>
    <div class="actions">
      @if (videoUrl()) {
        <button
          wwwSquircle="4"
          [wwwSquircleBorderWidth]="1"
          wwwSquircleBorderColor="rgba(0, 0, 0, 0.08)"
          (click)="onWatchDemo(videoUrl())"
        >
          <www-player-play height="16px" width="16px" />
          Watch a Demo
        </button>
      }

      @if (docsUrl()) {
        <a
          [routerLink]="docsUrl()"
          wwwSquircle="4"
          [wwwSquircleBorderWidth]="1"
          wwwSquircleBorderColor="rgba(0, 0, 0, 0.08)"
        >
          <www-book height="16px" width="16px" />
          Read the Docs</a
        >
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      position: relative;
      padding: 24px;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-start;
      flex: 1 0 0;
      align-self: stretch;
      height: 260px;
    }

    .content {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      gap: 16px;
      align-self: stretch;
    }

    .content .text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      align-self: stretch;
    }

    .content .text h3 {
      color: var(--gray-dark, #3d3c3a);
      font-family: 'JetBrains Mono';
      font-size: 15px;
      font-style: normal;
      font-weight: 800;
      line-height: 120%; /* 18px */
    }

    .content .text p {
      color: var(--gray, #5e5c5a);
      font-family: Fredoka;
      font-size: 13px;
      font-style: normal;
      font-weight: 400;
      line-height: 140%; /* 18.2px */
    }

    .coming-soon {
      position: absolute;
      top: 0;
      right: 0;
    }

    .actions {
      display: flex;
      padding-top: 8px;
      align-items: flex-start;
      gap: 4px;
    }

    a,
    button {
      display: flex;
      padding: 6px 12px 6px 6px;
      justify-content: center;
      align-items: center;
      gap: 4px;
      background-color: var(--vanilla-ivory, #faf9f0);
      color: var(--gray, #5e5c5a);
      font-family: Fredoka;
      font-size: 11px;
      font-style: normal;
      font-weight: 600;
      line-height: 120%; /* 13.2px */
    }
  `,
})
export class Feature {
  watchDemo = output<SafeResourceUrl>();
  title = input.required<string>();
  description = input.required<string>();
  imageUrl = input.required<string>();
  videoUrl = input<SafeResourceUrl>();
  docsPath = input<string[]>();
  preview = input<boolean>(false);
  configService = inject(ConfigService);
  docsUrl = computed(() => {
    const path = this.docsPath();
    if (!path) {
      return null;
    }
    return `/docs/${this.configService.sdk()}/${path.join('/')}`;
  });

  onWatchDemo(videoUrl?: SafeResourceUrl) {
    if (videoUrl) {
      this.watchDemo.emit(videoUrl);
    }
  }
}
