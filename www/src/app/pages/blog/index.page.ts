import { Component, computed, signal } from '@angular/core';
import { injectContentFiles } from '@analogjs/content';
import { PostPreview } from '../../components/PostPreview';
import { Filter, filter, PostAttributes } from '../../models/blog.models';

@Component({
  imports: [PostPreview],
  template: `
    <div class="bleed">
      <div class="title">
        <h1>Blog</h1>
        <div class="filters">
          @for (filter of filters; track filter.query) {
            <button
              [class.selected]="filter === selectedFilter()"
              (click)="onFilterClick(filter)"
            >
              {{ filter.text }}
            </button>
          }
        </div>
      </div>
      <div class="posts">
        @for (post of filteredPosts(); track post.slug; let i = $index) {
          <www-post-preview [post]="post" [size]="i === 0 ? 'lg' : 'sm'" />
        }
      </div>
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
    }

    .title {
      display: flex;
      align-items: flex-end;
      gap: 32px;

      > h1 {
        color: #774625;
        font:
          400 40px/56px 'KefirVariable',
          sans-serif;
        font-variation-settings: 'wght' 800;
      }

      > .filters {
        display: none;
        align-items: center;
        gap: 8px;

        > button {
          color: rgba(61, 60, 58, 0.72);
          padding: 8px 16px;
          border: 1px solid transparent;
          border-radius: 8px;
          border-radius: 24px;
          font:
            400 normal 14px/18px Poppins,
            sans-serif;
          text-decoration-line: underline;
          text-decoration-color: transparent;
          transition: text-decoration-color 0.2s ease-in-out;

          &.selected {
            background: rgba(61, 60, 58, 0.04);
          }

          &:hover {
            border-color: rgba(61, 60, 58, 0.24);
          }
        }

        > button.active {
          color: #774625;
        }
      }
    }

    .posts {
      display: grid;
      grid-template-columns: 1fr;
      gap: 32px;

      > *:first-child {
        grid-column: 1 / -1;
      }
    }

    @media screen and (min-width: 768px) {
      .title {
        > .filters {
          display: flex;
        }
      }

      .posts {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media screen and (min-width: 1024px) {
      .posts {
        grid-template-columns: repeat(3, 1fr);
      }
    }
  `,
})
export default class BlogIndexPage {
  readonly posts = injectContentFiles<PostAttributes>((contentFile) =>
    contentFile.filename.includes('/src/content/blog/'),
  );

  readonly filters = [
    filter('All blogs', ''),
    filter('Stories', 'stories'),
    filter('Talks', 'talks'),
    filter('Workshops', 'workshops'),
    filter('Podcasts', 'podcasts'),
  ];

  selectedFilter = signal<Filter>(this.filters[0]);
  filteredPosts = computed(() => {
    const selected = this.selectedFilter();

    const filtered =
      selected && selected.query
        ? this.posts.filter((post) =>
            post.attributes.tags?.includes(selected.query),
          )
        : this.posts;

    const parseDateFromSlug = (slug: string): number => {
      const datePart = slug.slice(0, 10);
      const time = Date.parse(datePart);
      return isNaN(time) ? 0 : time;
    };

    return [...filtered].sort(
      (a, b) => parseDateFromSlug(b.slug) - parseDateFromSlug(a.slug),
    );
  });

  onFilterClick(filter: Filter) {
    if (this.selectedFilter() === filter) {
      this.selectedFilter.set(this.filters[0]);
      return;
    }

    this.selectedFilter.set(filter);
  }
}
