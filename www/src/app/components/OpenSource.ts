import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'www-open-source',
  imports: [RouterLink],
  template: `
    <div class="bleed">
      <h2>
        <span>1</span><span>0</span><span>0</span><span>%</span>&nbsp;<span
          >o</span
        ><span>p</span><span>e</span><span>n</span>&nbsp;<span>s</span
        ><span>o</span><span>u</span><span>r</span><span>c</span><span>e</span>
      </h2>
      <p>
        Hashbrown is proudly free, MIT-licensed, and open source.<br />If you’d
        like to support the project, please consider purchasing
        <a routerLink="/enterprise" class="enterprise">Enterprise Support</a> or
        sponsoring our work on
        <a
          href="https://github.com/liveloveapp/hashbrown"
          rel="noopener"
          target="_blank"
          class="github"
        >
          GitHub </a
        >.
      </p>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      width: 100%;
      background: #3d3c3a;
    }

    .bleed {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 64px 32px;
      width: 100%;
      max-width: 767px;

      > h2 {
        font:
          700 56px/64px Fredoka,
          sans-serif;

        > span:nth-child(1) {
          color: #fbbb52;
        }
        > span:nth-child(2) {
          color: #64afb5;
        }
        > span:nth-child(3) {
          color: #e88c4d;
        }
        > span:nth-child(4) {
          color: #a0a985;
        }
        > span:nth-child(5) {
          color: #ad907c;
        }
        > span:nth-child(6) {
          color: #e27676;
        }
        > span:nth-child(7) {
          color: #fbbb52;
        }
        > span:nth-child(8) {
          color: #64afb5;
        }
        > span:nth-child(9) {
          color: #e88c4d;
        }
        > span:nth-child(10) {
          color: #a0a985;
        }
        > span:nth-child(11) {
          color: #ad907c;
        }
        > span:nth-child(12) {
          color: #e27676;
        }
        > span:nth-child(13) {
          color: #fbbb52;
        }
        > span:nth-child(14) {
          color: #64afb5;
        }
      }

      > p {
        color: rgba(250, 249, 240, 0.8);
        text-align: center;
        font:
          700 16px/24px Poppins,
          sans-serif;

        > a {
          text-decoration: underline;
          text-decoration-color: transparent;
          transition: text-decoration-color ease-in-out 0.2s;

          &.enterprise {
            color: #fbbb52;

            &:hover {
              text-decoration-color: #fbbb52;
            }
          }

          &.github {
            color: #9ecfd7;

            &:hover {
              text-decoration-color: #9ecfd7;
            }
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        padding: 128px 64px;
      }
    }
  `,
})
export class OpenSource {}
