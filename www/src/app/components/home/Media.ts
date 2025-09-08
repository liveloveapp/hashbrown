import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NgOptimizedImage } from '@angular/common';
import { Squircle } from '../Squircle';

type Video = { id: string; title: string; description?: string };

@Component({
  selector: 'www-media',
  imports: [Squircle, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bleed"
      wwwSquircle="32"
      [wwwSquircleBorderWidth]="1"
      wwwSquircleBorderColor="var(--sky-blue-dark)"
    >
      <div class="playlist">
        <div class="header">
          <h2>Hot Out of the Fryer</h2>
          <p>Our latest videos, podcasts, and more.</p>
        </div>
        <ul>
          @for (video of videos(); track video.id) {
            <li>
              <button
                type="button"
                (click)="select(video.id)"
                [class.active]="video.id === selectedId()"
                [attr.aria-current]="video.id === selectedId() ? 'true' : null"
                wwwSquircle="16"
              >
                <img
                  class="thumbnail"
                  [ngSrc]="thumbUrl(video.id)"
                  [srcset]="maxThumbUrl(video.id) + ' 2x'"
                  width="80"
                  height="45"
                  (error)="useMqFallback($event)"
                  [alt]="video.title"
                  wwwSquircle="8"
                />
                <div class="text">
                  <h4>{{ video.title }}</h4>
                  <p>{{ video.description }}</p>
                </div>
              </button>
            </li>
          }
        </ul>
      </div>
      <div class="player">
        <div class="video" wwwSquircle="16">
          <iframe
            [src]="embedUrl(selectedId())"
            [attr.title]="selectedVideo()?.title ?? 'YouTube video player'"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen
          ></iframe>
        </div>
        <div class="details">
          <h3>{{ selectedVideo()?.title }}</h3>
          <p>{{ selectedVideo()?.description }}</p>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px;
    }

    .bleed {
      display: grid;
      grid-template-columns: 1fr;
      width: 100%;
      max-width: 1200px;
      gap: 0;

      > .player {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 32px;
        background: var(--sky-blue, #9ecfd7);

        > .video {
          display: flex;
          width: 100%;
          aspect-ratio: 167/94;
          justify-content: flex-end;
          align-items: center;
          background: var(--gray-dark, #3d3c3a);

          > iframe {
            width: 100%;
            height: 100%;
          }
        }

        > .details {
          display: flex;
          flex-direction: column;

          > h3 {
            color: rgba(0, 0, 0, 0.56);
            font:
              750 20px/24px 'KefirVariable',
              sans-serif;
            font-variation-settings: 'wght' 750;
            letter-spacing: -0.02em;
          }

          > p {
            color: rgba(0, 0, 0, 0.64);
            font:
              500 16px/24px 'Fredoka',
              sans-serif;
          }
        }
      }

      > .playlist {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 24px;
        width: 100%;
        background: var(--sky-blue-light, #d8ecef);

        > .header {
          display: flex;
          flex-direction: column;
          padding: 8px 8px 0;

          > h2 {
            color: rgba(0, 0, 0, 0.64);
            font:
              750 20px/28px 'KefirVariable',
              sans-serif;
            font-variation-settings: 'wght' 750;
          }

          > p {
            color: var(--gray-dark, #3d3c3a);
            font:
              500 14px/19.6px 'Fredoka',
              sans-serif;
          }
        }

        > ul {
          display: flex;
          flex-direction: column;
          gap: 4px;

          > li {
            display: flex;

            > button {
              display: flex;
              align-items: center;
              gap: 16px;
              padding: 16px;
              width: 100%;
              text-align: left;

              &:hover,
              &.active {
                background: rgba(100, 175, 181, 0.4);
              }

              > .thumbnail {
                width: 80px;
                height: 45px;
                object-fit: cover;
              }

              > .text {
                display: flex;
                flex-direction: column;

                > h4 {
                  color: var(--gray-dark, #3d3c3a);
                  font:
                    500 13px/18.2px 'Fredoka',
                    sans-serif;
                }

                > p {
                  color: var(--gray-dark, #3d3c3a);
                  font:
                    600 10px/14px 'Fredoka',
                    sans-serif;
                }
              }
            }
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      :host {
        padding: 64px;
      }

      .bleed {
        grid-template-columns: 400px 1fr;
      }
    }
  `,
})
export class Media {
  private sanitizer = inject(DomSanitizer);

  videos = signal<Video[]>([
    {
      id: 'ekQ7t6_MvOQ',
      title: 'Generative UI on Learn with Jason',
      description: 'July 23, 2025',
    },
    {
      id: 'Vd2WLQ8vqfU',
      title: 'Introduction to Hashbrown on AngularAir',
      description: 'June 6, 2025',
    },
    {
      id: 'NSiggAt9Vc4',
      title: 'Building AI-powered apps with Hashbrown',
      description: 'July 6, 2025',
    },
  ]);

  selectedId = signal<string>(this.videos()[0]?.id ?? '');

  selectedVideo = computed(
    () => this.videos().find((v) => v.id === this.selectedId()) ?? null,
  );

  select(id: string) {
    this.selectedId.set(id);
  }

  embedUrl(id: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${id}`,
    );
  }

  thumbUrl(id: string) {
    return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  }

  maxThumbUrl(id: string) {
    return `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  }

  // If maxres doesn't exist, some browsers keep the broken 4x candidate—force mq.
  useMqFallback(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img.src.includes('maxresdefault')) {
      img.srcset = '';
      img.src = img.src.replace('maxresdefault', 'mqdefault');
    }
  }

  // Optional: if you ever only have a full URL, pull out the ID
  extractId(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
      return u.searchParams.get('v');
    } catch {
      return null;
    }
  }
}
