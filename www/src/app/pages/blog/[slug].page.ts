import { injectContent, MarkdownComponent } from '@analogjs/content';
import { Component, effect } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Youtube } from '../../components/Youtube';
import { PostAttributes } from '../../models/blog.models';

@Component({
  imports: [MarkdownComponent, Youtube],
  template: `
    <div class="bleed">
      @if (post(); as p) {
        <div class="title">
          <h1>{{ p.attributes.title }}</h1>
          <div class="team">
            @for (team of p.attributes.team; track team) {
              <img [src]="'/image/team/' + team + '.png'" />
            }
          </div>
        </div>

        @if (p.attributes.youtube) {
          <www-youtube
            [src]="p.attributes.youtube"
            [title]="p.attributes.title"
          />
        }

        <article>
          <analog-markdown [content]="p.content"></analog-markdown>
        </article>
      } @else {
        <div class="loading">Loading...</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      gap: 64px;
      padding: 64px 32px;
      max-width: 767px;
      width: 100%;

      > .title {
        display: flex;
        flex-direction: column;
        gap: 8px;

        > h1 {
          color: #774625;
          font:
            800 40px/56px 'KefirVariable',
            sans-serif;
          font-variation-settings: 'wght' 800;
        }

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
      }
    }

    article ::ng-deep analog-markdown > div {
      display: flex;
      flex-direction: column;

      h2 {
        font:
          500 24px/32px Fredoka,
          sans-serif;
        margin-top: 16px;
        margin-bottom: 24px;
      }

      h3 {
        font:
          500 20px/28px Fredoka,
          sans-serif;
        margin-top: 16px;
        margin-bottom: 24px;
      }

      h4 {
        margin-top: 16px;
        margin-bottom: 24px;
      }

      p {
        margin: 0 0 24px;
        line-height: 1.8;
      }

      a {
        text-decoration: underline;
        text-decoration-color: #774625;
        color: #774625;
        font-weight: 600;

        &:hover {
          text-decoration-color: #fbbb52;
        }
      }

      ul,
      ol {
        margin-bottom: 24px;
      }

      hr {
        border: 0;
        border-top: 1px solid rgba(47, 47, 43, 0.24);
        margin: 40px 0;
      }

      strong {
        font-weight: 600;
      }

      ul {
        list-style: disc;
        display: flex;
        flex-direction: column;
        gap: 24px;
        margin-left: 24px;
      }

      ol {
        list-style: decimal;
        display: flex;
        flex-direction: column;
        gap: 24px;
        margin-left: 24px;
      }

      > pre.shiki.hashbrown {
        padding: 16px;
        border-radius: 8px;
        background: #2b2a29 !important;
        overflow-x: auto;
        margin-bottom: 16px;
      }

      code:not(pre code) {
        font:
          700 16px/24px 'JetBrains Mono',
          monospace;
      }

      blockquote {
        background: #faf9f0;
        border-radius: 16px;
        padding: 24px;
        margin: 32px 0;

        > p {
          margin: 0;
          font:
            500 24px/32px Fredoka,
            sans-serif;
        }
      }

      img {
        max-width: 100%;
        height: auto;
        margin: 32px 0;
        padding: 32px;
      }

      .carousel {
        display: flex;
        gap: 16px;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;

        > img {
          margin: 0;
          padding: 0;
        }
      }

      .carousel::-webkit-scrollbar {
        display: none;
      }

      .carousel > * {
        flex: 0 0 100%;
        scroll-snap-align: start;
        border-radius: 16px;
        overflow: hidden;
      }

      .carousel > :nth-child(n + 6) {
        display: none;
      }

      table {
        border-collapse: collapse;
        border-radius: 12px;
        margin: 0 0 24px;
        overflow: hidden;
        box-shadow: inset 0 0 0 1px #000;

        > thead {
          padding: 8px 16px;
          color: rgba(250, 249, 240, 0.8);
          background: #3d3c3a;
          border-bottom: 1px solid #000;
          font-size: 12px;
          font-weight: 500;
        }

        tr {
          border-bottom: 1px solid #000;
        }

        th,
        td {
          padding: 16px;
          text-align: left;
        }

        th {
          font:
            400 16px/24px Fredoka,
            sans-serif;
        }

        code {
          white-space: nowrap;
        }
      }

      @media screen and (min-width: 768px) {
        .carousel > * {
          flex: 0 0 calc(50% - 8px);
        }
      }

      @media screen and (min-width: 1024px) {
        .carousel > * {
          flex: 0 0 calc(33.333% - 10.66px);
        }
      }
    }
  `,
})
export default class BlogPostComponent {
  readonly post$ = injectContent<PostAttributes>({
    subdirectory: 'blog',
    param: 'slug',
  });
  readonly post = toSignal(this.post$);
}
