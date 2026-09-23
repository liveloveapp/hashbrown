import { injectContentFiles } from '@analogjs/content';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PostAttributes } from '../../models/blog.models';
import { selectLatestPosts } from './latest-posts';

@Component({
  selector: 'www-latest-posts',
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>From the blog</h2>
    <div class="posts">
      @for (post of posts; track post.slug) {
        <a [routerLink]="['/blog', post.attributes.slug]">
          <small>{{ post.attributes.date | date: 'mediumDate' : 'UTC' }}</small>
          <h3>{{ post.attributes.title }}</h3>
          <p>{{ post.attributes.description }}</p>
        </a>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 0 72px;
    }

    h2 {
      margin-bottom: 32px;
      font: 800 40px/1.08 var(--font-heading);
      letter-spacing: -0.03em;
      color: var(--chocolate-brown);
    }

    .posts {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
    }

    a {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 22px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 18px;
      background: #fff;
      color: inherit;
      text-decoration: none;
    }

    small {
      font:
        400 13px/1 'Fredoka',
        sans-serif;
      color: var(--chocolate-brown-light);
    }

    h3 {
      font: 700 19px/1.25 var(--font-heading);
      letter-spacing: -0.02em;
      color: var(--chocolate-brown);
    }

    p {
      font:
        400 14.5px/1.5 'Fredoka',
        sans-serif;
      color: var(--gray);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    @media screen and (min-width: 1024px) {
      .posts {
        grid-template-columns: repeat(3, 1fr);
      }
    }
  `,
})
export class LatestPosts {
  readonly posts = selectLatestPosts(
    injectContentFiles<PostAttributes>((file) =>
      file.filename.includes('/src/content/blog/'),
    ),
    3,
  );
}
