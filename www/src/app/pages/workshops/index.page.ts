import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

@Component({
  imports: [],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="bleed">
      <div class="title">
        <h1>Workshops</h1>
      </div>
      <p>
        Sign up for our live, virtual workshops to see how to integrate
        Hashbrown in Angular and React applications.
      </p>

      <div>
        <h2>What You'll Learn</h2>

        <div class="learn-box">
          AI Fundamentals
          <ul>
            <li>How to generate a completion with an LLM</li>
            <li>What factors to consider when choosing an LLM</li>
            <li>
              What are tokens, how much do they cost, and how do you measure
              token usage
            </li>

            <li>How tool calling works</li>
          </ul>
        </div>

        <div class="learn-box">
          Intro to Hashbrown
          <ul>
            <li>Creating completions with Hashbrown</li>
            <li>Debugging completions</li>
            <li>
              Getting structured data out of LLMs with Skillet, Hashbrown’s
              schema language
            </li>
          </ul>
        </div>

        <div class="learn-box">
          Generative User Interfaces
          <ul>
            <li>Teaching LLMs how to render rich user interfaces</li>
            <li>
              Composing multiple AI-powered components to create agentic user
              interfaces
            </li>
            <li>
              Generating glue code on the fly and running it in Hashbrown’s
              JavaScript Runtime
            </li>
          </ul>
        </div>
      </div>

      <div>
        <h2>What You'll Build</h2>

        <div class="learn-box">
          <ul>
            <li>
              UI chat bot that can take action on behalf of the user (smart
              lighting demo)
            </li>
            <li>
              Natural language exploration tool of data (fully generative UI)
              (finance demo that works like the Spotify demo)
            </li>
          </ul>
        </div>
      </div>

      <div class="events">
        <h2>Hashbrown + Angular - August 2025</h2>
        <tito-widget event="hashbrown/hashbrown-angular-aug-2025"></tito-widget>

        <h2>Hashbrown + React - August 2025</h2>
        <tito-widget
          event="hashbrown/hashbrown-react-late-aug-2025"
        ></tito-widget>
      </div>
      <div class="posts"></div>
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
      gap: 32px;
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
    }

    h2 {
      color: #3d3c3a;
      font:
        700 normal 24px / 32px Fredoka,
        sans-serif;
    }

    .learn-box {
      color: rgba(61, 60, 58, 1);
      border: 1px solid #3d3c3a;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;

      border-radius: 16px;
      margin-bottom: 8px;
      margin-top: 8px;
    }

    ul {
      list-style: disc;
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-left: 24px;
      font:
        400 normal 14px / 18px Poppins,
        sans-serif;
    }
  `,
})
export default class WorkshopsIndexPage {}
