import { injectContentFiles } from '@analogjs/content';
import { RouteMeta } from '@analogjs/router';
import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Squircle } from '../../components/Squircle';
import { TheGravy } from '../../components/TheGravy';
import { ChevronRight } from '../../icons/ChevronRight';
import { WorkshopAttributes } from '../../models/workshop.models';
import { Markdown } from '../../pipes/Markdown';

export const routeMeta: RouteMeta = {
  title: 'Hashbrown AI Workshops',
  meta: [
    {
      name: 'og:title',
      content: 'Hashbrown AI Workshops',
    },
    {
      name: 'og:description',
      content: 'Hashbrown AI Workshops.',
    },
    {
      name: 'og:image',
      content: 'https://hashbrown.dev/image/meta/og-default.png',
    },
  ],
};

@Component({
  imports: [ChevronRight, RouterLink, Squircle, Markdown, TheGravy],
  template: `
    <div class="bleed">
      <div class="heading">
        <h1>
          Learn to Use
          <div class="ai-underline">LLMs</div>
          in Your Components
        </h1>
        <p>Bring the power of ChatGPT into your web apps.</p>
      </div>
      <div class="workshops">
        @for (workshop of workshops(); track workshop.filename) {
          <a [routerLink]="workshop.slug" wwwSquircle="16">
            <div>
              <h2>{{ workshop.attributes.title }}</h2>
              <div
                [innerHTML]="workshop.attributes.description | markdown"
                class="description"
              ></div>
            </div>
            <div class="tags">
              @for (tag of workshop.attributes.tags; track tag) {
                <span wwwSquircle="8">{{ tag }}</span>
              }
            </div>
            <div class="actions">
              <div class="action" wwwSquircle="8">
                <span>Learn More</span>
                <www-chevron-right />
              </div>
            </div>
          </a>
        }
      </div>
    </div>
    <www-the-gravy id="dd18d015-795c-4c3b-a7c1-3c6f73caa7f0" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      align-items: center;
      align-self: center;
      padding: 16px 16px 64px;
      gap: 24px;

      > .heading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        align-self: center;
        padding: 16px;

        > h1 {
          color: var(--gray);
          text-align: center;
          position: relative;
          z-index: 1;
          font:
            600 24px/32px 'KefirVariable',
            sans-serif;
          font-variation-settings: 'wght' 600;
          text-shadow: 0 0 1px var(--vanilla-ivory);

          > .ai-underline {
            display: inline-block;
            width: fit-content;

            &::after {
              content: '';
              position: relative;
              display: block;
              height: 3px;
              top: -5px;
              z-index: -1;
              background: var(--sunshine-yellow);
              border-radius: 2px;
              background: linear-gradient(
                90deg,
                var(--sunshine-yellow) 0%,
                var(--sunset-orange) 25%,
                var(--indian-red-light) 50%,
                var(--sky-blue) 75%,
                var(--olive-green-light) 100%
              );
              transition: width 0.5s ease;

              @starting-style {
                width: 0;
              }
            }
          }
        }

        > p {
          color: var(--gray, #5e5c5a);
          text-align: center;
          font:
            400 14px/18px 'Fredoka',
            sans-serif;
        }
      }

      > .workshops {
        display: grid;
        grid-template-columns: 1fr;
        gap: 32px;
        width: 100%;

        > a {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          padding: 24px;
          gap: 32px;
          background: rgba(61, 60, 58, 0.036);
          transition:
            transform 800ms cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 800ms cubic-bezier(0.16, 1, 0.3, 1),
            filter 800ms cubic-bezier(0.16, 1, 0.3, 1);
          transform-origin: center;
          will-change: transform;
          backface-visibility: hidden;

          &:hover {
            transform: translateY(-1px) scale(1.006);
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.1);
            filter: saturate(1.04) contrast(1.02);
          }

          > div {
            display: flex;
            flex-direction: column;
            gap: 16px;

            > h2 {
              color: var(--gray, #5e5c5a);
              font:
                500 24px/32px 'Fredoka',
                sans-serif;
            }

            > .description {
              > p {
                color: var(--gray, #5e5c5a);
                font:
                  300 18px/24px Fredoka,
                  sans-serif;

                > strong {
                  font-weight: 400;
                  color: var(--gray-dark, #3d3c3a);
                }

                > em {
                  position: relative;
                  font-style: italic;
                  z-index: 1;

                  &::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    height: 2px;
                    z-index: -1;
                    background-image: linear-gradient(
                      to right,
                      #fbbb52 0%,
                      var(--sunset-orange) 25%,
                      var(--indian-red-light) 50%,
                      var(--sky-blue-dark) 75%,
                      var(--olive-green-light) 100%
                    );
                  }
                }
              }
            }
          }

          > .tags {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;

            > span {
              background: rgba(61, 60, 58, 0.08);
              color: var(--gray, #5e5c5a);
              font:
                500 10px/16px 'Fredoka',
                sans-serif;
              padding: 8px 16px;
              word-break: keep-all;
              white-space: nowrap;
            }
          }

          > img {
            height: auto;
            width: 80%;
            align-self: center;
            object-fit: contain;
            margin: 32px 0;
            border-radius: 8px;
            border: 1px solid rgba(61, 60, 58, 0.24);
          }

          > .actions {
            flex: 1 auto;
            display: flex;
            flex-direction: row;
            justify-content: flex-end;
            align-items: flex-end;
            gap: 16px;
            margin-top: 32px;

            > .action {
              display: flex;
              align-items: center;
              gap: 4px;
              background: var(--sunshine-yellow, #fbbb52);
              padding: 8px 16px;
              border-radius: 8px;

              > span {
                color: var(--gray, #5e5c5a);
                font:
                  400 16px/24px 'Fredoka',
                  sans-serif;
              }
            }
          }
        }
      }
    }

    @media screen and (min-width: 768px) {
      .bleed {
        padding: 64px 32px;
        max-width: 1281px;
        gap: 64px;

        > .heading {
          > h1 {
            font:
              800 32px/40px 'KefirVariable',
              sans-serif;
            font-variation-settings: 'wght' 800;
          }

          > p {
            font:
              400 18px/24px 'Fredoka',
              sans-serif;
          }
        }

        > .workshops {
          grid-template-columns: 1fr 1fr;
        }
      }
    }
  `,
})
export default class WorkshopsIndexPage {
  readonly contentFiles = injectContentFiles<WorkshopAttributes>(
    (contentFile) => contentFile.filename.includes('/src/content/workshops/'),
  );

  readonly workshops = computed(() => {
    return this.contentFiles
      .filter((file) => file.attributes.active)
      .sort((a, b) => a.attributes.order - b.attributes.order);
  });
}
