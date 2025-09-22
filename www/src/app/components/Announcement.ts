import { Component } from '@angular/core';
import { Close } from '../icons/Close';
import { PlayerPlay } from '../icons/PlayerPlay';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-announcement',
  imports: [Close, PlayerPlay, Squircle],
  template: `
    @if (showAnnouncement) {
      <div class="alert">
        <div class="content">
          <div class="player">
            <img
              src="/image/landing-page/wdc-s2e9.jpg"
              alt="Hashbrown on the Web Dev Challenge Season 2 Episode 9"
            />
          </div>
          <div class="text">
            <div class="announcement">
              <h3>Hashbrown on the Web Dev Challenge</h3>
              <p>
                The challenge: three teams had 30 minutes to plan and 4 hours to
                build an app with Hashbrown.
              </p>
            </div>
            <div class="actions">
              <a
                href="https://www.youtube.com/watch?v=nUSbmGQRsv4&list=PLz8Iz-Fnk_eTkZvSNWXW_TKZ2UwVirT2M"
                target="_blank"
                wwwSquircle="8"
              >
                Watch Now <www-player-play height="16px" width="16px" />
              </a>
            </div>
          </div>
        </div>
        <button (click)="onDismiss()" aria-label="Dismiss announcement">
          <www-close height="16px" width="16px" />
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
      position: fixed;
      bottom: 32px;
      z-index: 1000;
      opacity: 1;
      transition: opacity 800ms ease-in-out;
      padding: 0 16px;
      pointer-events: none;

      @starting-style {
        opacity: 0;
      }

      .alert {
        pointer-events: auto;
        display: inline-grid;
        grid-template-areas: 'announcement close' 'gradient gradient';
        grid-template-columns: 1fr 32px;
        grid-template-rows: 1fr 8px;
        max-width: 680px;
        width: 100%;
        overflow: hidden;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.8);
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 16px 2px rgba(0, 0, 0, 0.12);
        transition: background-color 300ms ease-in-out;

        &:hover {
          background: rgba(255, 255, 255, 0.92);
        }

        > .content {
          grid-area: announcement;
          display: inline-grid;
          grid-template-columns: 160px 1fr;
          gap: 16px;
          padding: 16px;
          color: rgba(0, 0, 0, 0.64);
          font:
            400 13px/140% 'Fredoka',
            sans-serif;

          > .player {
            width: 160px;
            height: 107px;
            position: relative;

            > img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }
          }

          > .text {
            display: flex;
            flex-direction: column;
            gap: 16px;

            > .announcement {
              display: flex;
              flex-direction: column;

              > h3 {
                color: var(--gray-dark, #3d3c3a);
                font:
                  750 16px/24px KefirVariable,
                  sans-serif;
                font-variation-settings: 'wght' 750;
              }

              > p {
                text-wrap: balance;
                color: rgba(0, 0, 0, 0.64);
                font:
                  600 13px/140% 'Fredoka',
                  sans-serif;
              }
            }

            > .actions {
              display: flex;

              > a {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 8px 16px;
                background: var(--sky-blue, #9ecfd7);
                color: rgba(0, 0, 0, 0.64);
                font:
                  400 13px/140% 'Fredoka',
                  sans-serif;
              }
            }
          }
        }

        > button {
          grid-area: close;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 24px 24px 0 0;
          opacity: 0.56;
          transition: opacity 0.2s ease-in-out;
          cursor: pointer;

          &:hover {
            opacity: 1;
          }
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
  currentAnnouncementDate = new Date('2025-08-17');
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
