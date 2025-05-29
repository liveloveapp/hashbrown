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
  selector: 'www-ldp-tour',
  imports: [LpdNaturalLanguage, LdpCompletions, LdpVibeCode],
  template: `
    <section class="product-tour">
      <!-- Left: sticky animation area -->
      <div class="tour-sidebar">
        <div class="feature-animation">
          <div class="anim" [class.active]="1 === activeStep()" data-step="1">
            @if (activeStep() === 1) {
              <www-lpd-natural-language />
            }
          </div>
          <div class="anim" [class.active]="2 === activeStep()" data-step="2">
            @if (activeStep() === 2) {
              <www-lpd-completions />
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
            translate natural language into structured data
          </h2>
          <p [class.active]="1 === activeStep()">
            Simplify complex forms & filters by leveraging large language models
            to accept your user's natural language translated into your app's
            existing data structures.
          </p>
        </section>
        <section class="step" data-step="2" #step>
          <h2 [class.active]="2 === activeStep()">
            speed up workflows with suggestions and completions
          </h2>
          <p [class.active]="2 === activeStep()">
            Streamline your users' workflows by intelligently guessing their
            next steps. Subtly there when it helps speed them up, and totally
            ignorable when they are focused.
          </p>
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
        </section>
        <section class="step" data-step="4" #step>
          <h2 [class.active]="4 === activeStep()">
            vibe code directly in the browser, safely & securely
          </h2>
          <p [class.active]="4 === activeStep()">
            What if we could leverage vibe coding as an app capability? Turn
            user intent and your data into code using LLMs, then use Hashbrown
            to safely and securely run that code in a sandboxed environment.
          </p>
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
        max-width: 1106px;
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
        gap: 8px;
        padding: 2rem;
        opacity: 1;
        transition: opacity 0.5s ease;
      }

      .step.active {
        opacity: 1;
      }

      h2 {
        color: #5e5c5a;
        font-family: 'Fredoka';
        font-size: 28px;
        font-style: normal;
        font-weight: 600;
        line-height: 38px; /* 118.75% */
      }
    `,
  ],
})
export class LdpTour implements AfterViewInit {
  steps = viewChildren<ElementRef<HTMLElement>>('step');
  observations = signal<{ step: number; ratio: number }[]>([]);
  sortedObservations = computed(() =>
    this.observations().sort((a, b) => b.ratio - a.ratio),
  );
  bestObservation = computed(() => this.sortedObservations()[0]);
  activeStep = signal(0);

  constructor(private zone: NgZone) {}

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
