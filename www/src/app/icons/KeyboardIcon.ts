import { Component, Input } from '@angular/core';

@Component({
  selector: 'www-keyboard-icon',
  template: `
    <span class="keyboard-icon">
      <span class="visually-hidden">Press </span>
      <kbd class="keyboard-key">
        <abbr title="Command" class="no-underline">⌘</abbr>
      </kbd>
      <span class="visually-hidden"> and </span>
      <kbd class="keyboard-key">K</kbd>
      <span class="visually-hidden"> to search</span>
    </span>
  `,
  styles: [
    `
      :host {
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .keyboard-icon {
        border: 1px solid rgba(166, 216, 210, 0.88);
        background-color: rgba(166, 216, 210, 0.24);
        padding: 4px 6px;
        font: 400 11px/12px sans-serif;
        border-radius: 24px;
        text-decoration-line: underline;
        text-decoration-color: transparent;
        transition:
          color 0.2s ease-in-out,
          text-decoration-color 0.2s ease-in-out;
      }

      .keyboard-icon:hover {
        text-decoration-color: #2f2f2b;
      }

      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
      }

      abbr {
        text-decoration: none;
      }
    `,
  ],
})
export class KeyboardIcon {}
