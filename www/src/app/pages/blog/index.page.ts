import { injectContentFiles } from '@analogjs/content';
import { RouteMeta } from '@analogjs/router';
import { Component, computed, signal } from '@angular/core';
import { PostPreview } from '../../components/PostPreview';
import { Filter, filter, PostAttributes } from '../../models/blog.models';

export const routeMeta: RouteMeta = {
  title: 'Home: Hashbrown Blog',
  meta: [
    {
      name: 'og:title',
      content: 'Home: Hashbrown Blog',
    },
    {
      name: 'og:description',
      content: 'Hashbrown Blog.',
    },
    {
      name: 'og:image',
      content: 'https://hashbrown.dev/image/meta/og-default.png',
    },
  ],
};

@Component({
  imports: [PostPreview],
  template: `
    <div class="hero">
      <img
        src="/image/blog/brian-mike-jason.jpg"
        alt="Brian, Mike and Jason looking at a laptop and computer screen with code and a generative user interface application"
      />
    </div>
    <div class="bleed">
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
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .hero {
      width: 100%;
      height: 100%;
      max-height: 600px;
      display: flex;
      justify-content: center;
      align-items: center;

      > img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .bleed {
      align-self: center;
      display: flex;
      flex-direction: column;
      gap: 56px;
      padding: 64px 32px;
      width: 100%;
      max-width: 1024px;

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
            400 normal 14px/18px Fredoka,
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

      > .posts {
        display: grid;
        grid-template-columns: 1fr;
        row-gap: 32px;

        > * {
          border: 1px solid rgba(61, 60, 58, 0.24);
        }
      }
    }

    @media screen and (min-width: 768px) and (max-width: 1023px) {
      .bleed {
        > .filters {
          display: flex;
        }

        > .posts {
          grid-template-columns: repeat(2, 1fr);
          row-gap: 0;
          border-top: 1px solid rgba(61, 60, 58, 0.24);
          border-bottom: 1px solid rgba(61, 60, 58, 0.24);

          > * {
            border-top: none;
            border-right: 1px solid rgba(61, 60, 58, 0.24);
            border-bottom: 1px solid rgba(61, 60, 58, 0.24);
            border-left: none;
          }

          > *:first-child {
            grid-column: 1 / -1;
            margin-bottom: 64px;
          }

          > *:nth-child(2),
          > *:nth-child(3) {
            border-top: 1px solid rgba(61, 60, 58, 0.24);
          }

          > *:nth-child(2n + 1) {
            border-right: none;
          }

          > *:nth-last-child(1),
          > *:nth-last-child(2):not(:nth-child(2n + 1)) {
            border-bottom: none;
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        > .filters {
          display: flex;
        }

        > .posts {
          grid-template-columns: repeat(3, 1fr);
          row-gap: 0;
          border-top: 1px solid rgba(61, 60, 58, 0.24);
          border-bottom: 1px solid rgba(61, 60, 58, 0.24);

          > * {
            border-top: none;
            border-right: 1px solid rgba(61, 60, 58, 0.24);
            border-bottom: 1px solid rgba(61, 60, 58, 0.24);
            border-left: none;
          }

          > *:first-child {
            grid-column: 1 / -1;
            margin-bottom: 64px;
          }

          > *:nth-child(3n + 1) {
            border-right: none;
          }

          > *:nth-child(2),
          > *:nth-child(3),
          > *:nth-child(4) {
            border-top: 1px solid rgba(61, 60, 58, 0.24);
          }

          > *:nth-last-child(1),
          > *:nth-last-child(2):not(:nth-child(3n + 1)),
          > *:nth-last-child(3):not(:nth-child(3n + 1)) {
            border-bottom: none;
          }
        }
      }
    }
  `,
})
export default class BlogIndexPage {
  readonly filters = [
    filter('All blogs', ''),
    filter('Stories', 'story'),
    filter('Talks', 'talk'),
    filter('Releases', 'release'),
  ];
  selectedFilter = signal<Filter>(this.filters[0]);

  readonly contentFiles = injectContentFiles<PostAttributes>((contentFile) =>
    contentFile.filename.includes('/src/content/blog/'),
  );

  readonly posts = computed(() =>
    this.contentFiles.map((contentFile) => {
      const datePart = contentFile.attributes.slug.slice(0, 10);
      if (!datePart) {
        return contentFile;
      }

      return {
        ...contentFile,
        attributes: {
          ...contentFile.attributes,
          date: new Date(datePart),
        },
      };
    }),
  );

  filteredPosts = computed(() => {
    const selected = this.selectedFilter();
    const posts = this.posts();

    const filtered =
      selected && selected.query
        ? posts.filter((post) => post.attributes.tags?.includes(selected.query))
        : posts;

    return [...filtered].sort(
      (a, b) =>
        (b.attributes.date?.getTime() ?? 0) -
        (a.attributes.date?.getTime() ?? 0),
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
