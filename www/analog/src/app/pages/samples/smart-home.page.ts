import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Header } from '../../components/Header';

@Component({
  imports: [Header, RouterLink],
  template: `
    <www-header />
    <main>
      <h1>Smart Home example retired</h1>
      <p>This legacy example is no longer maintained.</p>
      <p>
        <a routerLink="/samples">Explore the maintained invoicing example</a>,
        built with React, Hashbrown, B4 and Pretable using simulated data.
      </p>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    main {
      max-width: 960px;
      margin: 48px auto;
      padding: 24px;
    }
    h1 {
      font:
        750 32px/1.2 KefirVariable,
        sans-serif;
    }
    p {
      font:
        400 18px/1.6 Fredoka,
        sans-serif;
      margin-top: 24px;
    }
    a {
      text-decoration: underline;
    }
  `,
})
export default class SmartHomeSamplePage {}
