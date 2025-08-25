import { injectContentFiles } from '@analogjs/content';
import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Squircle } from '../../components/Squircle';
import { ChevronRight } from '../../icons/ChevronRight';
import { WorkshopAttributes } from '../../models/workshop.models';

@Component({
  imports: [ChevronRight, RouterLink, Squircle],
  template: `
    <div class="header">
      <h1>Workshops</h1>
      <p>
        Start building the future of web apps with generative UI - not just
        chatbots and text - but, yeah, you can do that with Hashbrown too.
      </p>
      <p>Join our live, remote, hands-on workshops with the Hashbrown team.</p>
    </div>
    <img
      src="/image/product/workshop/mike-whiteboard.jpg"
      alt="Mike Ryan drawing software architecture diagrams on a whiteboard"
      wwwSquircle="16"
    />
    <section>
      <h2>Start Building Web Apps with AI</h2>
      <p>
        Users are falling in love with the capabilities of using natural
        language to learn, browse, and do.
      </p>
      <p>
        And, as web developers, we are using AI to code, build, and test our
        apps, close issues, automate workflows, and more.
      </p>
      <p>
        <strong
          >But, what if we could bring the power of ChatGPT into our web
          apps?</strong
        >
        Let's start building the web that uses the power of AI models to
        <em>modernize</em>&nbsp;<em>web</em>&nbsp;<em>apps</em>. Generate text
        input completions, simplify and get rid of complex forms, allow the user
        to take an action or navigate within your app by providing suggestions
        based on their past actions and interactions, and stream generative user
        interfaces into your web app that is adaptive, dynamic, and
        customizable. We're talking more than just chatbots and text!
      </p>
      <p>
        <strong
          >Show me a graph of the quarterly sales year over year. Make it a
          grouped bar chart by quarter. Oh, and put the legend on the
          bottom.</strong
        >
        Using Hashbrown, you can build agentic user experiences like this - that
        assemble and generate the interface using your
        <em>existing</em>&nbsp;<em>components</em>.
      </p>
    </section>
    <section>
      <h2>Workshops</h2>
      <div class="workshops">
        @for (workshop of workshops(); track workshop.filename) {
          <a
            [routerLink]="workshop.slug"
            wwwSquircle="16"
            [wwwSquircleBorderWidth]="1"
            wwwSquircleBorderColor="var(--sky-blue, #9ecff5)"
          >
            <div>
              <h3>{{ workshop.attributes.title }}</h3>
              <p>{{ workshop.attributes.description }}</p>
            </div>
            <www-chevron-right />
          </a>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 48px;
    }

    .header {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: fit-content;

      > h1 {
        color: var(--gray, #5e5c5a);
        font:
          750 32px / 40px 'KefirVariable',
          sans-serif;
        font-variation-settings: 'wght' 750;
      }

      > p {
        text-wrap: balance;
        color: var(--gray-dark, #3d3c3a);
        margin: 0;
        font:
          300 18px/24px Fredoka,
          sans-serif;
      }
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    section {
      display: flex;
      flex-direction: column;
      gap: 16px;

      > h2 {
        color: var(--gray, #5e5c5a);
        font:
          500 normal 24px/32px Fredoka,
          sans-serif;
      }

      > p {
        text-wrap: balance;
        color: var(--gray, #5e5c5a);
        font:
          300 normal 18px/30px Fredoka,
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

    .workshops {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100%;

      > a {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        background-color: var(--sky-blue-light, #d8e8e8);
        text-decoration: none;
        color: var(--gray-dark, #3d3c3a);

        > div {
          display: flex;
          flex-direction: column;
          gap: 8px;

          > h3 {
            font:
              500 normal 18px/24px Fredoka,
              sans-serif;
          }

          > p {
            font:
              300 normal 14px/18px Fredoka,
              sans-serif;
          }
        }

        > www-chevron-right {
          flex-shrink: 0;
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
