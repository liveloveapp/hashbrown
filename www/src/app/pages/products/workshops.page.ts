import {
  Component,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Sell } from '../../icons/Sell';
import { MatIcon } from '@angular/material/icon';

@Component({
  imports: [Sell, RouterLink, MatIcon],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="bleed">
      <div class="header">
        <h1>Generative UI Workshops</h1>
      </div>

      <p class="under-header">
        Learn the fundamentals of AI engineering and how to create generative
        user interfaces in hands-on workshops from the team behind Hashbrown
      </p>

      <img
        src="/image/product/workshop/mike-whiteboard.jpg"
        alt="Mike Ryan drawing software architecture diagrams on a whiteboard"
      />
      <p>
        Our workshops are live, hands-on, and taught by the core hashbrown team.
      </p>

      <p>
        Hashbrown is an open-source framework for building generative user
        interfaces in React. It exposes generative AI through a set of React
        Hooks, and helpers for consuming generative AI outputs. Using Hashbrown,
        you can stream text, structured data, React component trees, and even
        runnable JavaScript from large language models.
      </p>

      <h2>Prerequisites</h2>

      <p>
        Hashbrown is an open-source framework for building generative user
        interfaces in React. It exposes generative AI through a set of React
        Hooks, and helpers for consuming generative AI outputs. Using Hashbrown,
        you can stream text, structured data, React component trees, and even
        runnable JavaScript from large language models.
      </p>

      <div class="courses">
        <div class="course">
          <span class="course-title"> React: Intro To Generative UIs </span>
          <span class="when">September 8 - 8am to 3pm PT</span>
          <span class="price">
            <www-sell
              height="14px"
              width="14px"
              stroke="#E88C4D"
              fill="#E88C4D"
            />
            $350 per person. Group discounts available.
          </span>
          <div class="action">
            <a
              href="https://ti.to/liveloveapp/hashbrown-react-sep-2025"
              target="_blank"
            >
              Reserve to Attend Online</a
            >
          </div>
        </div>
        <div class="course">
          <span class="course-title">Angular: Intro To Generative UIs</span>
          <span class="when">September 9 - 8am to 3pm PT</span>
          <span class="price">
            <www-sell
              height="14px"
              width="14px"
              stroke="#E88C4D"
              fill="#E88C4D"
            />
            $350 per person. Group discounts available.
          </span>
          <div class="action">
            <a
              href="https://ti.to/liveloveapp/hashbrown-angular-sep-2025"
              target="_blank"
            >
              Reserve to Attend Online</a
            >
          </div>
        </div>
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

    .bleed {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 32px;
      margin-top: 32px;
      width: calc(100% - 364px);
      max-width: 1024px;

      > .header {
        width: fit-content;
      }

      > .header h1 {
        color: var(--gray-dark, #3d3c3a);
        transition: color 0.2s ease-in-out;
        font:
          400 32px / 40px 'KefirVariable',
          sans-serif;
        font-variation-settings: 'wght' 800;
        margin-top: 32px;
      }

      > .header h1:after {
        content: '';
        height: 4px;
        // width: 100%;
        display: block;
        background-image: linear-gradient(
          to right,
          #fbbb52 0%,
          var(--sunset-orange) 25%,
          var(--indian-red-light) 50%,
          var(--sky-blue-dark) 75%,
          var(--olive-green-light) 100%
        );
      }

      > h2 {
        color: var(--gray-dark, #3d3c3a);
        transition: color 0.2s ease-in-out;
        font:
          400 18px / 24px 'Fredoka',
          sans-serif;
      }

      > img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      > p {
        color: var(--gray, #5e5c5a);
        text-align: left;
        font:
          300 normal 16px/22px Fredoka,
          sans-serif;
      }

      > .under-header {
        font:
          500 normal 18px/24px Fredoka,
          sans-serif;
      }

      > .courses {
        position: fixed;
        top: 154px;
        right: 0;
        width: 316px;
        height: 100dvh;
        padding-right: 16px;

        > .course {
          display: flex;
          flex-direction: column;

          > .course-title {
            color: var(--gray, #3d3c3a);
            font:
              400 17px / 25px 'KefirVariable',
              sans-serif;
            font-variation-settings: 'wght' 800;
          }

          > .when {
            color: var(--gray, #3d3c3a);
            font:
              400 16px / 24px 'Fredoka',
              sans-serif;
          }

          > .price {
            display: flex;
            gap: 4px;
            color: var(--gray, #3d3c3a);
            font:
              400 14px / 20px 'Fredoka',
              sans-serif;
          }

          > .action {
            display: flex;
            justify-content: stretch;
            padding-bottom: 32px;
            padding-top: 8px;

            > a {
              width: 100%;
              display: flex;
              padding: 12px 24px;
              justify-content: center;
              align-items: center;
              border-radius: 8px;
              color: rgba(0, 0, 0, 0.64);
              background: var(--sunshine-yellow-light, #fde4ba);
              font:
                400 16px/18px 'Fredoka',
                sans-serif;
            }
          }
        }
      }
    }

    @media screen and (max-width: 768px) {
    }
  `,
})
export default class WorkshopsIndexPage {
  readonly angular = signal<Date[]>([
    new Date(2025, 9, 6),
    new Date(2025, 9, 20),
  ]);

  readonly react = signal<Date[]>([
    new Date(2025, 8, 8),
    new Date(2025, 8, 16),
    new Date(2025, 8, 22),
    new Date(2025, 8, 30),
  ]);

  readonly angularMonths = computed<Date[]>(() => {
    return [...new Set(this.angular().map((date) => date.getMonth()))].map(
      (month) => new Date(2025, month, 1),
    );
  });

  readonly reactMonths = computed<Date[]>(() => {
    return [...new Set(this.react().map((date) => date.getMonth()))].map(
      (month) => new Date(2025, month, 1),
    );
  });
}
