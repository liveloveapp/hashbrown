import { ContentFile } from '@analogjs/content';
import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandYoutube } from '../icons/BrandYoutube';
import { PostAttributes } from '../models/blog.models';

type Size = 'sm' | 'lg';

@Component({
  imports: [RouterLink, BrandYoutube, DatePipe],
  selector: 'www-post-preview',
  host: {
    '[class.sm]': 'size() === "sm"',
    '[class.lg]': 'size() === "lg"',
  },
  template: `
    @let p = post();

    <a [routerLink]="p.slug">
      <div class="title">
        <h2>{{ p.attributes.title }}</h2>
        @if (p.attributes.date) {
          <time>{{ p.attributes.date | date: 'MMM d, yyyy' }}</time>
        }
      </div>
      <div class="description">
        <p>{{ p.attributes.description }}</p>
        <div class="spacer"></div>
        <div class="footer">
          <div class="team">
            @for (team of p.attributes.team; track team) {
              <img [src]="'/image/team/' + team + '.png'" />
            }
          </div>
          <div>
            @if (p.attributes.youtube) {
              <www-brand-youtube />
            }
          </div>
        </div>
      </div>
    </a>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }

    a {
      display: flex;
      flex-direction: column;
      gap: 32px;
      height: 100%;
      padding: 32px;

      &:hover {
        > .title {
          > h2 {
            color: var(--sunset-orange, #e88c4d);
          }
        }
      }

      > .title {
        display: flex;
        flex-direction: column;
        gap: 8px;

        > h2 {
          color: var(--gray-dark, #3d3c3a);
          transition: color 0.2s ease-in-out;
          font:
            400 24px/32px 'KefirVariable',
            sans-serif;
          font-variation-settings: 'wght' 400;
        }

        > time {
          color: var(--gray-light, #a4a3a1);
          font:
            400 normal 14px/18px Poppins,
            sans-serif;
        }

        > p {
          color: var(--gray, #5e5c5a);
          font:
            400 normal 16px/24px Fredoka,
            sans-serif;
        }
      }

      > .description {
        flex: 1 auto;
        display: flex;
        flex-direction: column;
        gap: 8px;

        > .spacer {
          flex: 1 auto;
        }

        > .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;

          > .team {
            display: flex;
            align-items: center;

            > img {
              width: 36px;
              height: 36px;
              border-radius: 50%;
              border: 2px solid #fff;

              &:not(:first-child) {
                margin-left: -8px;
              }
            }
          }

          > www-brand-youtube {
            margin-left: auto;
          }
        }
      }

      > p {
        font:
          400 normal 14px/18px Poppins,
          sans-serif;
      }
    }
  `,
})
export class PostPreview {
  post = input.required<ContentFile<PostAttributes>>();
  size = input<Size>('sm');
}
