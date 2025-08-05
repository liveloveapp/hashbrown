import {
  Component,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Calendar } from '../../components/Calendar';
import { Angular } from '../../icons/Angular';
import { Check } from '../../icons/Check';
import { React } from '../../icons/React';

@Component({
  imports: [Angular, Calendar, Check, React, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="bleed">
      <h1>Generative UI Workshops</h1>
      <p>
        Learn the fundamentals of AI engineering and how to create generative
        user interfaces in this hands-on workshop from the team behind Hashbrown
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
          <div class="price">
            <span>$350</span>
            <span>/ seat</span>
          </div>
          <div class="action">
            @defer {
              <tito-button event="liveloveapp/hashbrown-react-sep-2025">
                Sep 9, 10am - 5pm ET
              </tito-button>
            }
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

    // .hero {
    //   width: calc(100%-200px);
    //   height: 100%;
    //   max-height: 600px;
    //   display: flex;
    //   justify-content: center;
    //   align-items: center;
    //   padding: 32px;

    //   > img {
    //     width: 100%;
    //     height: 100%;
    //     object-fit: cover;
    //   }
    // }

    .bleed {
      // align-self: center;
      display: flex;
      flex-direction: column;
      gap: 56px;
      padding: 32px;
      width: calc(100% - 200px);
      max-width: 1024px;

      > h1 {
        color: var(--gray-dark, #3d3c3a);
        transition: color 0.2s ease-in-out;
        font:
          400 24px / 32px 'KefirVariable',
          sans-serif;
        font-variation-settings: 'wght' 400;
      }

      > h2 {
        color: var(--gray-dark, #3d3c3a);
        transition: color 0.2s ease-in-out;
        font:
          400 16px / 24px 'KefirVariable',
          sans-serif;
        font-variation-settings: 'wght' 400;
      }

      > img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      > p {
        color: var(--gray, #5e5c5a);
        text-align: center;
        font:
          500 normal 18px/24px Fredoka,
          sans-serif;
      }

      > .courses {
        position: fixed;
        top: 80;
        right: 0;
        width: 200px;
        height: 100dvh;

        > .course {
          display: flex;
          flex-direction: column;
          gap: 8px;

          > .title {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 32px;
            border-bottom: 1px solid rgba(61, 60, 58, 0.24);

            > h2 {
              color: var(--gray-dark, #3d3c3a);
              font:
                400 24px/32px 'KefirVariable',
                sans-serif;
              font-variation-settings: 'wght' 400;
            }

            > small {
              display: flex;
              align-items: center;
              gap: 8px;
              color: var(--gray, #5e5c5a);
              font:
                400 normal 16px/24px Fredoka,
                sans-serif;
            }
          }

          > .price {
            display: flex;
            justify-content: center;
            align-items: flex-end;
            gap: 4px;
            padding: 32px;

            > span:first-child {
              color: var(--gray-dark, #3d3c3a);
              font:
                400 32px/40px 'KefirVariable',
                sans-serif;
              font-variation-settings: 'wght' 400;
            }

            > span:last-child {
              color: var(--gray, #5e5c5a);
              font:
                400 normal 14px/20px Fredoka,
                sans-serif;
            }
          }

          > .action {
            display: flex;
            justify-content: stretch;
            padding: 32px;

            > a,
            > tito-button button {
              width: 100%;
              display: flex;
              padding: 12px 24px;
              justify-content: center;
              align-items: center;
              border-radius: 8px;
              color: rgba(0, 0, 0, 0.64);
              background: #e1e1e1;
              font:
                700 14px/16px 'Fredoka',
                sans-serif;
            }

            > tito-button {
              width: 100%;

              > button {
                background: var(--sunshine-yellow, #fbbb52);
              }
            }
          }
        }

        > div:not(:nth-child(3n)) {
          border-right: 1px solid rgba(61, 60, 58, 0.24);
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 64px;

        > .courses {
          grid-template-columns: repeat(3, 1fr);
        }
      }
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
