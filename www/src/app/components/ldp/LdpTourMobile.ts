import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  NgZone,
  signal,
  viewChildren,
} from '@angular/core';
import { LpdNaturalLanguage } from './LpdNaturalLanguage';
import { LdpCompletions } from './LdpCompletions';
import { LdpVibeCode } from './LdpVibeCode';

@Component({
  selector: 'www-ldp-tour-mobile',
  imports: [LpdNaturalLanguage, LdpCompletions, LdpVibeCode],
  template: `
    <section class="product-tour">
      <div class="tour">
        <div class="feature-animation">
          <div class="anim structured-anim" data-step="1">
            <h2>translate natural language into structured data</h2>
            <p>
              Simplify complex forms & filters by leveraging large language
              models to accept your user's natural language translated into your
              app's existing data structures.
            </p>
            <www-lpd-natural-language />
          </div>
          <div class="anim" data-step="2">
            <h2>speed up workflows with suggestions and completions</h2>
            <p>
              Streamline your users' workflows by intelligently guessing their
              next steps. Subtly there when it helps speed them up, and totally
              ignorable when they are focused.
            </p>

            <www-lpd-completions />
          </div>
          <div class="anim" data-step="3">
            <h2>create a chat experience that you'd want to use</h2>
            <p>
              Imagine if AI Chat worked like a shell-like interface for power
              users. Build chat experiences that let your users orchestrate
              service calls that stream directly into your app's component layer
              - perfect for those times when a structured user interface would
              slow them down.
            </p>

            <img src="/image/landing-page/chat-demo.svg" alt="Chat Demo" />
          </div>
          <div class="anim" data-step="4">
            <h2>vibe code directly in the browser, safely & securely</h2>
            <p>
              What if we could leverage vibe coding as an app capability? Turn
              user intent and your data into code using LLMs, then use Hashbrown
              to safely and securely run that code in a sandboxed environment.
            </p>
            <www-ldp-vibe-code />
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .product-tour {
        display: flex;
        padding: 0 24px;
        gap: 96px;
      }

      .tour {
        position: sticky;
        top: 0;
        overflow: hidden;
      }

      .feature-animation {
        position: relative;
        width: 100%;
        height: 100%;
      }

      .feature-animation .anim {
        width: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        margin-top: 8px;
        margin-bottom: 32px;
      }

      .structured-anim {
        flex: 1;
      }

      .feature-animation .anim.active {
        opacity: 1;
        transform: scale(1);
      }

      .step {
        scroll-snap-align: start;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 8px;
        padding: 2rem;
        opacity: 1;
        transition: opacity 0.5s ease;
      }

      h2 {
        color: #5e5c5a;
        font-family: 'Fredoka';
        font-size: 28px;
        font-style: normal;
        font-weight: 600;
        line-height: 38px; /* 118.75% */
      }

      p {
        margin-bottom: 8px;
      }
    `,
  ],
})
export class LdpTourMobile {}
