import { Component, signal } from '@angular/core';
import { EnterpriseProducts } from '../components/EnterpriseProducts';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { LightsDemo } from '../components/LightsDemo';
import { LdpTour } from '../components/lpd/LdpTour';

@Component({
  imports: [Header, Footer, Hero, EnterpriseProducts, LightsDemo, LdpTour],
  template: `
    <www-header />
    <main>
      <www-hero />
      <section class="welcome">
        <div class="content">
          <p class="intro">
            You know that spark of joy you feel when GitHub Copilot nails your
            function implementation or ChatGPT delivers the perfect response?
            hashbrown brings that same delight to your apps —
            <em>
              built for developers who see AI as a helpful technology in
              creating friendlier, more accessible software</em
            >.
          </p>
          <hr />
          <p>
            hashbrown is a free, open-source framework for integrating AI
            capabilities directly into your app layer. It is perfectly suited
            for creating ephemeral user experiences, like translating natural
            language into structured data, generating suggestions, and
            implementing AI chat.
          </p>
          <p>
            Use hashbrown's NodeJS-based abstraction layer for common LLM
            providers, like OpenAI and Google, to expose streaming AI
            capabilities over your API. Then use one of our frontend SDKs to
            consume these APIs with full support for common AI concepts like
            tool calling and structured outputs.
          </p>
          <p>
            hashbrown takes it a step further, focusing on AI engineering in the
            browser. It provides its own LLM-optimized schema language letting
            you consume streaming structured outputs. It can instruct LLMs to
            respond in your app’s component layer providing chat experiences
            richer than traditional text-based chat. It even ships with a
            JavaScript virtual machine letting you execute LLM-generated
            JavaScript safely and securely in the browser.
          </p>
        </div>
      </section>
      <www-lpd-tour />
      <www-enterprise-products />
    </main>
    <www-footer />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    main {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: stretch;
    }

    .welcome {
      display: flex;
      padding: 128px 32px;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background-color: #faf9f0;

      > .content {
        display: flex;
        flex-direction: column;
        gap: 32px;
        max-width: 680px;
        width: 100%;

        > hr {
          border: 0;
          border-top: 1px solid rgba(47, 47, 43, 0.24);
          margin: 32px 0;
        }

        > p {
          color: #3d3c3a;
          font:
            400 16px/24px Poppins,
            sans-serif;

          &.intro {
            color: #5e5c5a;
            font:
              500 18px/32px Poppins,
              sans-serif;

            > em {
              color: #e8a23d;
            }
          }
        }
      }
    }
  `,
})
export default class HomePage {}
