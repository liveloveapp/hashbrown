import { Component, input } from '@angular/core';
import { LpdWindow } from './LpdWindow';

@Component({
  selector: 'www-ldp-completions-light',
  template: `
    <span class="name">{{ name() }}</span>
    <div class="slider">
      <div class="slider-track">
        <div class="slider-track-fill"></div>
        <div class="slider-thumb"></div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1fr 120px;
      gap: 16px;
      padding: 8px 0;
    }

    .name {
      color: #000;
      font-family: Fredoka;
      font-size: 13px;
      font-style: normal;
      font-weight: 400;
      line-height: 130%; /* 16.9px */
    }

    .slider {
      width: 100%;
      height: 10px;
      background-color: #e0e0e0;
      border-radius: 5px;
      position: relative;
    }

    .slider-track {
      width: 100%;
      height: 100%;
      background-color: #fde4ba;
      border-radius: 5px;
      position: absolute;
      top: 0;
      left: 0;
    }

    .slider-track-fill {
      width: 50%;
      height: 100%;
      background-color: #fbbb52;
      border-radius: 5px;
      position: absolute;
      top: 0;
      left: 0;
    }

    .slider-thumb {
      width: 8px;
      height: 8px;
      background-color: #fff;
      border-radius: 50%;
      position: absolute;
      top: 1px;
      left: calc(50% - 9px);
    }
  `,
})
export class LdpCompletionsLight {
  name = input.required<string>();
}

@Component({
  selector: 'www-lpd-completions',
  imports: [LpdWindow, LdpCompletionsLight],
  template: `
    <www-lpd-window title="Manage Lights">
      <div class="completions">
        <span class="title">Your Lights</span>
        <div class="divider"></div>
        <www-ldp-completions-light name="Living Room - Corner Lamp" />
        <www-ldp-completions-light name="Living Room - TV Light Bar" />
        <www-ldp-completions-light name="Living Room - Floor Lamp" />
        <div class="divider"></div>
        <div class="footer">
          <div class="label">Light Name</div>
          <div class="input">
            <span class="typewriter"> Living Room - Ce</span>
            <span class="caret"></span>
            <span class="completion">iling</span>
          </div>
          <div class="add-light-button">Add Light</div>
        </div>
      </div>
    </www-lpd-window>
  `,
  styles: `
    .completions {
      background-color: #faf9f0;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .title {
      color: #000;
      font-family: Fredoka;
      font-size: 11px;
      font-style: normal;
      font-weight: 500;
      line-height: 130%; /* 14.3px */
    }

    .divider {
      width: 100%;
      height: 1px;
      background-color: #e0e0e0;
    }

    .footer {
      display: grid;
      grid-template-columns: auto fit-content(100px);
      grid-template-rows: 14px 1fr;
      grid-template-areas:
        'label label'
        'input add-light-button';
      column-gap: 8px;
      row-gap: 2px;
    }

    .label {
      grid-area: label;
      color: #3d3c3a;
      font-family: Fredoka;
      font-size: 11px;
      font-style: normal;
      font-weight: 500;
      line-height: 130%; /* 14.3px */
    }

    .input {
      grid-area: input;
      display: flex;
      padding: 8px 12px;
      justify-content: flex-start;
      align-items: center;
      flex: 1 0 0;
      border: 1px solid #3d3c3a;
      background: #fff;
      color: #3d3c3a;
      font-family: Fredoka;
      font-size: 13px;
      font-style: normal;
      font-weight: 400;
      line-height: 130%; /* 16.9px */
    }

    .add-light-button {
      grid-area: add-light-button;
      display: flex;
      padding: 8px 12px;
      justify-content: center;
      align-items: center;
      gap: 10px;
      border: 1px solid #774625;
      color: #774625;
      font-family: Fredoka;
      font-size: 13px;
      font-style: normal;
      font-weight: 400;
      line-height: 130%; /* 16.9px */
    }

    .typewriter {
      overflow: hidden;
      border-right: 0.15em solid currentColor;
      white-space: nowrap;
      display: inline-block;
      animation:
        typingEnglish 2s steps(26, end) forwards,
        blinkCaret 0.75s step-end infinite;
    }

    .completion {
      color: rgba(0, 0, 0, 0.38);
      font-family: Fredoka;
      font-size: 13px;
      font-style: italic;
      font-weight: 400;
      margin-left: -0.15em;
      animation: fadeIn 0.1s ease-in 2s forwards;
      opacity: 0;
    }

    @keyframes typingEnglish {
      from {
        width: 0;
      }
      to {
        width: 13.8ch;
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

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  `,
})
export class LdpCompletions {}
