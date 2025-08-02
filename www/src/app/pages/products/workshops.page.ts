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
    <div class="hero">
      <img
        src="/image/product/workshop/mike-whiteboard.jpg"
        alt="Mike Ryan drawing software architecture diagrams on a whiteboard"
      />
    </div>
    <div class="bleed">
      <p>
        Our workshops are live, hands-on, and taught by the core hashbrown team.
      </p>
      <div class="courses">
        <div class="course">
          <div class="title">
            <h2>Build Generative UI</h2>
            <small
              ><www-angular
                fill="var(--gray-dark, #3d3c3a)"
                height="18px"
                width="18px"
              />
              Angular</small
            >
          </div>
          <div class="details">
            <ul>
              <li><www-check />Generate completions</li>
              <li><www-check />LLM models, capabilities, and limitations</li>
              <li><www-check />Tokens and token usage</li>
              <li><www-check />Skillet - hashbrown's schema language</li>
              <li><www-check />Debugging</li>
              <li><www-check />Function calling</li>
              <li><www-check />Structured output</li>
              <li>
                <www-check />Running code in hashbrown's JavaScript runtime
              </li>
              <li><www-check />Exposing components</li>
              <li><www-check />Generative user interfaces</li>
              <li><www-check />Agentic user interfaces</li>
              <li>
                <www-check />Generating user interfaces using JavaScript Runtime
              </li>
            </ul>
          </div>
          <div class="calendars">
            @for (month of angularMonths(); track month) {
              <www-calendar [month]="month" [dates]="angular()" />
            }
          </div>
          <div class="price">
            <span>$350</span>
            <span>/ seat</span>
          </div>
          <div class="action">
            @defer {
              <tito-button event="liveloveapp/hashbrown-angular-sep-2025">
                Sep 8, 10am - 5pm ET
              </tito-button>
            }
          </div>
        </div>
        <div class="course">
          <div class="title">
            <h2>Build Generative UI</h2>
            <small
              ><www-react
                fill="var(--gray-dark, #3d3c3a)"
                height="18px"
                width="18px"
              />
              React</small
            >
          </div>
          <div class="details">
            <ul>
              <li><www-check />Generate completions</li>
              <li><www-check />LLM models, capabilities, and limitations</li>
              <li><www-check />Tokens and token usage</li>
              <li><www-check />Skillet - hashbrown's schema language</li>
              <li><www-check />Debugging</li>
              <li><www-check />Function calling</li>
              <li><www-check />Structured output</li>
              <li>
                <www-check />Running code in hashbrown's JavaScript runtime
              </li>
              <li><www-check />Exposing components</li>
              <li><www-check />Generative user interfaces</li>
              <li><www-check />Agentic user interfaces</li>
              <li>
                <www-check />Generating user interfaces using JavaScript Runtime
              </li>
            </ul>
          </div>
          <div class="calendars">
            @for (month of reactMonths(); track month) {
              <www-calendar [month]="month" [dates]="react()" />
            }
          </div>
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
        <div class="course">
          <div class="title">
            <h2>Customized</h2>
            <small>Customized engagements</small>
          </div>
          <div class="details">
            <ul>
              <li><www-check />Onsite, online, or hybrid</li>
              <li><www-check />Volume discount</li>
              <li><www-check />Customized content</li>
            </ul>
          </div>
          <div class="action">
            <a routerLink="/contact-us">Contact Us</a>
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
      padding: 32px;
      width: 100%;
      max-width: 1024px;

      > p {
        color: var(--gray, #5e5c5a);
        text-align: center;
        font:
          500 normal 18px/24px Fredoka,
          sans-serif;
      }

      > .courses {
        display: grid;
        grid-template-columns: 1fr;
        border-top: 1px solid rgba(61, 60, 58, 0.24);
        border-bottom: 1px solid rgba(61, 60, 58, 0.24);

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

          > .details {
            flex: 1 auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 32px;

            > p {
              color: var(--gray-dark, #3d3c3a);
              font:
                400 normal 14px/18px Poppins,
                sans-serif;
            }

            > ul {
              display: flex;
              flex-direction: column;
              gap: 16px;

              > li {
                display: flex;
                gap: 8px;
                font:
                  300 normal 14px/20px Fredoka,
                  sans-serif;
              }
            }
          }

          > .calendars {
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 32px;

            > www-calendar {
              width: 100%;
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
