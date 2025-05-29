import { Component } from '@angular/core';
import { CodeHighlight } from '../../pipes/CodeHighlight';
import { LpdWindow } from './LpdWindow';

@Component({
  selector: 'www-lpd-natural-language',
  template: `
    <www-lpd-window title="Schedule an Event">
      <div class="form">
        <span class="label">When?</span>
        <div class="input">
          <!-- English first -->
          <div class="typewriter english">Every Monday and Wednesday</div>
          <!-- Marathi next -->
          <div class="typewriter marathi">
            प्रत्येक महिन्याच्या पंधराव्या दिवशी
          </div>
        </div>
      </div>

      <div class="code-wrapper">
        <!-- English JSON output -->
        <div
          class="code english"
          [innerHTML]="englishJson | codeHighlight"
        ></div>

        <!-- Marathi JSON output -->
        <div
          class="code marathi"
          [innerHTML]="marathiJson | codeHighlight"
        ></div>
      </div>
    </www-lpd-window>
  `,
  imports: [LpdWindow, CodeHighlight],
  styles: [
    `
      .form {
        background-color: rgba(250, 249, 240, 1);
        padding: 16px;
      }

      .label {
        color: #774625;
        font:
          500 11px/130% normal 'Poppins',
          sans-serif;
      }

      .input {
        display: flex;
        padding: 8px 12px;
        align-items: center;
        align-self: stretch;
        border: 1px solid #774625;
        background: #fff;
      }

      .code-wrapper {
        padding: 16px;
        background-color: #3d3c3a;
      }

      /*──────────────────────────────────────────────*/
      /* 1) BASE TYPEWRITER STYLES */
      .typewriter {
        overflow: hidden;
        border-right: 0.15em solid currentColor;
        white-space: nowrap;
        display: inline-block;
      }

      /* hide Marathi until its turn */
      .typewriter.marathi,
      :host .code.marathi {
        opacity: 0;
      }

      /*──────────────────────────────── ENGLISH ANIM */
      .typewriter.english {
        animation:
          typingEnglish 2s steps(26, end) forwards,
          blinkCaret 0.75s step-end infinite,
          eraseEnglish 2s ease 6s forwards;
      }

      @keyframes typingEnglish {
        from {
          width: 0;
        }
        to {
          width: 43ch;
        }
      }

      /*──────────────────────────────── MARATHI ANIM */
      .typewriter.marathi {
        animation:
          showMarathiWrapper 0s linear 8s forwards,
          typingMarathi 2s steps(18, end) 8s forwards,
          blinkCaret 0.75s step-end infinite 8s;
      }

      @keyframes typingMarathi {
        from {
          width: 0;
        }
        to {
          width: 24ch;
        }
      }

      @keyframes blinkCaret {
        0%,
        100% {
          border-color: transparent;
        }
        50% {
          border-color: currentColor;
        }
      }

      @keyframes eraseEnglish {
        from {
          width: 43ch;
        }
        to {
          width: 0;
          border-right-color: transparent;
        }
      }

      /*──────────────────────────────────────────────*/
      /* show/hide wrappers */

      @keyframes showMarathiWrapper {
        to {
          opacity: 1;
        }
      }

      @keyframes collapseEnglish {
        from {
          max-height: 500px;
          opacity: 1;
        }
        to {
          max-height: 0;
          opacity: 0;
        }
      }

      /*──────────────────────────────────────────────*/
      /* 2) FADE-IN-FROM-TOP for JSON lines */
      :host .code.english ::ng-deep .line,
      :host .code.marathi ::ng-deep .line {
        opacity: 0;
        transform: translateY(-20px);
        animation: fadeInFromTop 0.4s ease-out forwards;
      }

      @keyframes fadeInFromTop {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /*──────────────────────────────────────────────*/
      /* 3) STAGGERING AND SHOW/HIDE FOR JSON BLOCKS */
      /* English JSON: fade in lines at 2s–4s, then hide block at 4s */
      :host .code.english {
        overflow: hidden;
        max-height: 0;
        animation:
          expandEnglish 2.8s ease 2s forwards,
          collapseEnglish 2s ease 6s forwards;
      }
      @keyframes expandEnglish {
        from {
          max-height: 0;
        }
        to {
          max-height: 500px;
        }
      }
      :host .code.english ::ng-deep .line:nth-child(1) {
        animation-delay: 2s;
      }
      :host .code.english ::ng-deep .line:nth-child(2) {
        animation-delay: 2.4s;
      }
      :host .code.english ::ng-deep .line:nth-child(3) {
        animation-delay: 2.8s;
      }
      :host .code.english ::ng-deep .line:nth-child(4) {
        animation-delay: 3.2s;
      }
      :host .code.english ::ng-deep .line:nth-child(5) {
        animation-delay: 3.6s;
      }
      :host .code.english ::ng-deep .line:nth-child(6) {
        animation-delay: 4s;
      }
      :host .code.english ::ng-deep .line:nth-child(7) {
        animation-delay: 4.4s;
      }

      /* Marathi JSON: show block at 6s, then fade in lines 6s–8s */
      :host .code.marathi {
        overflow: hidden;
        max-height: 0;
        animation:
          expandMarathi 2.8s ease 8s forwards,
          showMarathiWrapper 0s linear 8s forwards;
      }
      @keyframes expandMarathi {
        from {
          max-height: 0;
        }
        to {
          max-height: 500px;
        }
      }
      :host .code.marathi ::ng-deep .line:nth-child(1) {
        animation-delay: 8s;
      }
      :host .code.marathi ::ng-deep .line:nth-child(2) {
        animation-delay: 8.4s;
      }
      :host .code.marathi ::ng-deep .line:nth-child(3) {
        animation-delay: 8.8s;
      }
      :host .code.marathi ::ng-deep .line:nth-child(4) {
        animation-delay: 9.2s;
      }
      :host .code.marathi ::ng-deep .line:nth-child(5) {
        animation-delay: 9.6s;
      }
      :host .code.marathi ::ng-deep .line:nth-child(6) {
        animation-delay: 10s;
      }
    `,
  ],
})
export class LpdNaturalLanguage {
  englishJson = JSON.stringify(
    {
      recurrenceType: 'Weekly',
      byWeekDay: ['MO', 'WE'],
    },
    null,
    2,
  );

  marathiJson = JSON.stringify(
    {
      recurrenceType: 'Monthly',
      byMonthDay: [15],
    },
    null,
    2,
  );
}
