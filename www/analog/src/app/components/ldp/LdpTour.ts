import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../services/ConfigService';
import { LdpCompletions } from './LdpCompletions';
import { LdpVibeCode } from './LdpVibeCode';
import { LpdNaturalLanguage } from './LpdNaturalLanguage';

@Component({
  selector: 'www-ldp-tour',
  imports: [LpdNaturalLanguage, LdpCompletions, LdpVibeCode, RouterLink],
  template: `
    <section class="product-tour">
      <!-- Left: sticky animation area -->
      <div class="tour-sidebar">
        <div class="feature-animation">
          <div class="anim" [class.active]="1 === activeStep()" data-step="1">
            @if (activeStep() === 1) {
              <www-lpd-completions />
            }
          </div>
          <div class="anim" [class.active]="2 === activeStep()" data-step="2">
            @if (activeStep() === 2) {
              <www-lpd-natural-language />
            }
          </div>
          <div class="anim" [class.active]="3 === activeStep()" data-step="3">
            @if (activeStep() === 3) {
              <img src="/image/landing-page/chat-demo.svg" alt="Chat Demo" />
            }
          </div>
          <div class="anim" [class.active]="4 === activeStep()" data-step="4">
            @if (activeStep() === 4) {
              <www-ldp-vibe-code />
            }
          </div>
        </div>
      </div>

      <!-- Right: scrolling content -->
      <div class="tour-content">
        <section class="step" data-step="1" #step>
          <h2 [class.active]="1 === activeStep()">
            speed up workflows with suggestions and completions
          </h2>
          <p [class.active]="1 === activeStep()">
            Use hashbrown to streamline your users' workflows by intelligently
            predicting their next steps or guessing their next input. Subtly
            there when it helps speed them up, and totally ignorable when they
            are focused.
          </p>
          <a
            [routerLink]="[docsUrl(), 'concept', 'structured-output']"
            class="btn"
          >
            learn more
          </a>
        </section>
        <section class="step" data-step="2" #step>
          <h2 [class.active]="2 === activeStep()">
            Simplify complex forms & filters with natural language input
          </h2>
          <p [class.active]="2 === activeStep()">
            Simplify complex forms & filters by accepting your users' natural
            language. Hashbrown uses AI under-the-hood along with
            <a [routerLink]="[docsUrl(), 'concept', 'schema']">Skillet</a>, our
            LLM-optimized schema language, to translate text into your app's
            existing data structures.
          </p>
          <a
            [routerLink]="[docsUrl(), 'concept', 'structured-output']"
            class="btn"
          >
            learn more
          </a>
        </section>
        <section class="step" data-step="3" #step>
          <h2 [class.active]="3 === activeStep()">
            create a chat experience that you'd want to use
          </h2>
          <p [class.active]="3 === activeStep()">
            Imagine if AI Chat worked like a shell-like interface for power
            users. Build chat experiences that let your users orchestrate
            service calls that stream directly into your app's component layer -
            perfect for those times when a structured user interface would slow
            them down.
          </p>
          <a [routerLink]="[docsUrl(), 'concept', 'components']" class="btn">
            learn more
          </a>
        </section>
        <section class="step" data-step="4" #step>
          <h2 [class.active]="4 === activeStep()">
            vibe code directly in the browser, safely & securely
          </h2>
          <p [class.active]="4 === activeStep()">
            Hashbrown ships with a JavaScript VM to safely and securely run
            LLM-authored scripts in the browser. Useful for grounding
            mathematical operations, the JavaScript VM can also be leveraged for
            file creation and analysis. You can even use
            <a [routerLink]="[docsUrl(), 'concept', 'schema']">Skillet</a> to
            expose custom APIs into the runtime. Imagine letting your users
            safely "vibe code" in the context of your service and component
            layer.
          </p>
          <a [routerLink]="[docsUrl(), 'concept', 'runtime']" class="btn">
            learn more
          </a>
        </section>
      </div>
    </section>
  `,
  styles: [
    `
      .product-tour {
        display: grid;
        grid-template-columns: 450px 1fr;
        padding: 0 24px;
        max-width: 1080px;
        gap: 96px;
        margin: 0 auto;
      }

      .tour-sidebar {
        position: sticky;
        top: 0;
        height: 100vh;
        overflow: hidden;
      }

      .feature-animation {
        position: relative;
        width: 100%;
        height: 100%;
      }

      .feature-animation .anim {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        transform: scale(0.9);
        transition:
          opacity 0.5s ease,
          transform 0.5s ease;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .feature-animation .anim.active {
        opacity: 1;
        transform: scale(1);
      }

      .tour-content {
      }

      .step {
        scroll-snap-align: start;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 16px;
        padding: 2rem;
        opacity: 1;
        transition: opacity 0.5s ease;

        > h2 {
          color: rgba(94, 92, 90, 0.88);
          font:
            600 32px/38px 'KefirVariable',
            sans-serif;
          font-variation-settings: 'wght' 600;
          margin: 0;
        }

        > p {
          color: #5e5c5a;
          font:
            400 16px/24px Fredoka,
            sans-serif;
        }

        > a {
          display: inline-block;
          align-self: flex-start;
          padding: 8px 16px;
          background-color: #fbbb52;
          color: #fff;
          border-radius: 24px;
          font:
            400 14px/20px Fredoka,
            sans-serif;
        }
      }

      .step.active {
        opacity: 1;
      }
    `,
  ],
})
export class LdpTour implements AfterViewInit {
  configService = inject(ConfigService);
  docsUrl = computed(() => `/docs/${this.configService.sdk()}`);
  steps = viewChildren<ElementRef<HTMLElement>>('step');
  observations = signal<{ step: number; ratio: number }[]>([]);
  sortedObservations = computed(() =>
    this.observations().sort((a, b) => b.ratio - a.ratio),
  );
  bestObservation = computed(() => this.sortedObservations()[0]);
  activeStep = signal(0);

  ngAfterViewInit() {
    if (
      typeof window === 'undefined' ||
      typeof window.IntersectionObserver === 'undefined'
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const stepUpdates = entries.map((s) => ({
          step: Number(s.target.getAttribute('data-step')),
          ratio: s.intersectionRatio,
        }));
        const bestStep = stepUpdates.find((step) => step.ratio > 0.5);
        if (bestStep) {
          this.activeStep.set(bestStep.step);
        }
      },
      {
        rootMargin: '0px',
        threshold: 0.5,
      },
    );
    this.steps().forEach((s) => observer.observe(s.nativeElement));
  }
}
