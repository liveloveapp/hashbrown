import { Component } from '@angular/core';

@Component({
  selector: 'app-describing-loader',
  standalone: true,
  template: `
    <div class="describing-card">
      <div class="sparkfield">
        @for (spark of sparks; track spark) {
          <span class="spark"></span>
        }
      </div>
      <div class="stacks">
        @for (row of rows; track row) {
          <span class="row"></span>
        }
      </div>
      <div class="caption">describing your chart…</div>
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
      width: 240px;
      height: 200px;
      align-items: center;
      justify-content: center;
    }

    .describing-card {
      position: relative;
      width: 220px;
      height: 176px;
      padding: 16px 18px;
      border-radius: 24px;
      border: 1px solid rgba(251, 187, 82, 0.35);
      background: linear-gradient(135deg, #ffffff, #fdf5e5);
      box-shadow: inset 0 10px 28px rgba(255, 255, 255, 0.45);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sparkfield {
      position: absolute;
      inset: 6px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      opacity: 0.7;
    }

    .spark {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: radial-gradient(circle, #64afb5, rgba(100, 175, 181, 0));
      animation: drift 5s ease-in-out infinite;
    }

    .spark:nth-child(odd) {
      background: radial-gradient(circle, #fbbb52, rgba(251, 187, 82, 0));
    }

    .spark:nth-child(1) {
      animation-delay: 0ms;
    }

    .spark:nth-child(2) {
      animation-delay: 400ms;
    }

    .spark:nth-child(3) {
      animation-delay: 800ms;
    }

    .spark:nth-child(4) {
      animation-delay: 1200ms;
    }

    .spark:nth-child(5) {
      animation-delay: 1600ms;
    }

    .spark:nth-child(6) {
      animation-delay: 2000ms;
    }

    .spark:nth-child(7) {
      animation-delay: 2400ms;
    }

    .spark:nth-child(8) {
      animation-delay: 2800ms;
    }

    .spark:nth-child(9) {
      animation-delay: 3200ms;
    }

    .stacks {
      position: relative;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: auto;
    }

    .row {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: linear-gradient(90deg, #b76060, #e88c4d, #fbbb52);
      opacity: 0.3;
      animation: shimmer 2.4s ease-in-out infinite;
    }

    .row:nth-child(1) {
      width: 85%;
      animation-delay: 0ms;
    }

    .row:nth-child(2) {
      width: 100%;
      animation-delay: 160ms;
    }

    .row:nth-child(3) {
      width: 68%;
      animation-delay: 320ms;
    }

    .row:nth-child(4) {
      width: 92%;
      animation-delay: 480ms;
    }

    .row:nth-child(5) {
      width: 78%;
      animation-delay: 640ms;
    }

    .row:nth-child(6) {
      width: 60%;
      animation-delay: 800ms;
    }

    .caption {
      font-family: 'Fredoka', sans-serif;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: lowercase;
      color: #774625;
      text-align: center;
      margin-top: 4px;
    }

    @keyframes drift {
      0% {
        transform: translateY(0px) scale(0.85);
        opacity: 0.2;
      }
      50% {
        transform: translateY(-6px) scale(1);
        opacity: 0.8;
      }
      100% {
        transform: translateY(0px) scale(0.85);
        opacity: 0.2;
      }
    }

    @keyframes shimmer {
      0% {
        opacity: 0.2;
        transform: translateX(-8px);
      }
      50% {
        opacity: 0.6;
        transform: translateX(0px);
      }
      100% {
        opacity: 0.2;
        transform: translateX(8px);
      }
    }
  `,
})
export class DescribingLoader {
  readonly sparks = Array.from({ length: 9 }, (_, index) => index);
  readonly rows = Array.from({ length: 6 }, (_, index) => index);
}
