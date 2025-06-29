import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PostAttributes } from '../models/blog.models';
import { ContentFile } from '@analogjs/content';
import { BrandYoutube } from '../icons/BrandYoutube';

type Size = 'sm' | 'lg';

@Component({
  imports: [RouterLink, BrandYoutube],
  selector: 'www-post-preview',
  host: {
    '[class.sm]': 'size() === "sm"',
    '[class.lg]': 'size() === "lg"',
  },
  template: `
    @let p = post();

    <a [routerLink]="p.slug">
      <h2>{{ p.attributes.title }}</h2>
      <p>{{ p.attributes.description }}</p>
      <div class="grow"></div>
      <div class="footer">
        <div class="team">
          @for (team of p.attributes.team; track team) {
            <img [src]="'/image/team/' + team + '.png'" />
          }
        </div>
        @if (p.attributes.youtube) {
          <www-brand-youtube />
        }
      </div>
    </a>
  `,
  styles: `
    :host {
      display: flex;
      width: 100%;

      &.sm {
        > a {
          color: rgba(61, 60, 58, 1);
          border: 1px solid #3d3c3a;
          padding: 16px;

          > h2 {
            color: #3d3c3a;
            font:
              700 normal 24px/32px Fredoka,
              sans-serif;
          }
        }
      }

      &.lg {
        background: #3d3c3a;
        border-radius: 16px;

        > a {
          color: #faf9f0;
          width: 100%;

          > h2 {
            color: #fde4ba;
          }

          > .footer {
            > .team {
              > img {
                border-color: #3d3c3a;
              }
            }
          }
        }
      }
    }

    a {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 32px;
      border-radius: 16px;

      > h2 {
        font:
          700 normal 32px/40px Fredoka,
          sans-serif;
      }

      > .grow {
        flex-grow: 1;
      }

      > .footer {
        display: flex;
        align-items: center;
        gap: 8px;

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
