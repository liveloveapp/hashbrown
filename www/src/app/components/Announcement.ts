import { Component } from '@angular/core';
import { Squircle } from './Squircle';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'www-announcement',
  imports: [Squircle, RouterLink],
  template: `
    @if (showAnnouncement) {
      <div class="alert" wwwSquircle="0 0 8 8">
        <a routerLink="/workshops/react-generative-ui-engineering">
          <strong>New!</strong> Workshop tickets for
          <em>Build Generative UIs in React</em>
          are on sale now.
        </a>
        <button
          class="close"
          (click)="onDismiss()"
          aria-label="Dismiss announcement"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lucide lucide-x"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        <div class="gradient"></div>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      max-width: 100vw;
      position: fixed;
      bottom: 32px;
      z-index: 1000;
      opacity: 1;
      transition: opacity 800ms ease-in-out;
      padding: 0 16px;

      @starting-style {
        opacity: 0;
      }

      .alert {
        display: inline-grid;
        grid-template-areas: 'announcement close' 'gradient gradient';
        grid-template-columns: 1fr 32px;
        grid-template-rows: 1fr 8px;
        justify-content: center;
        align-items: center;
        border-radius: 8px 8px 1px 1px;
        background: rgba(255, 255, 255, 0.8);
        backdrop-filter: blur(10px);
        box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.12);
        width: auto;
        transition: background-color 300ms ease-in-out;

        &:hover {
          background: rgba(255, 255, 255, 0.92);
        }

        a {
          grid-area: announcement;
          padding: 11px 24px 12px 24px;
          color: rgba(0, 0, 0, 0.64);
          text-align: center;
          font:
            400 13px/140% 'Fredoka',
            sans-serif;

          strong {
            font-weight: 700;
          }

          em {
            text-decoration: underline;
            text-decoration-style: solid;
            text-decoration-thickness: 1px;
            transition: text-decoration-thickness 0.2s ease-in-out;
          }

          &:hover em {
            text-decoration-thickness: 2px;
          }
        }
      }

      .close {
        grid-area: close;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 24px;
        padding-right: 8px;
        background: none;
        border: none;
        opacity: 0.56;
        transition: opacity 0.2s ease-in-out;

        &:hover {
          opacity: 1;
        }
      }

      .gradient {
        grid-area: gradient;
        width: 100%;
        height: 8px;
        background: linear-gradient(
          to right,
          #fbbb52 0%,
          var(--sunset-orange) 25%,
          var(--indian-red-light) 50%,
          var(--sky-blue-dark) 75%,
          var(--olive-green-light) 100%
        );
        background-clip: border-box;
      }
    }
  `,
})
export class Announcement {
  currentAnnouncementDate = new Date('2025-09-30');
  showAnnouncement = false;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const lastAnnouncementDateTime = localStorage.getItem(
        'lastAnnouncementDateTime',
      );
      if (lastAnnouncementDateTime) {
        const lastAnnouncementDateTimeDate = new Date(lastAnnouncementDateTime);
        if (lastAnnouncementDateTimeDate < this.currentAnnouncementDate) {
          this.showAnnouncement = true;
        }
      } else {
        this.showAnnouncement = true;
      }
    }
  }

  onDismiss() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        'lastAnnouncementDateTime',
        this.currentAnnouncementDate.toISOString(),
      );
      this.showAnnouncement = false;
    }
  }
}
