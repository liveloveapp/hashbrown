import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';

@Component({
  imports: [RouterOutlet, Footer, Header],
  template: `
    <www-header />
    <main>
      <div>
        <router-outlet></router-outlet>
      </div>
    </main>
    <www-footer />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    www-header {
      border-bottom: 1px solid rgba(61, 60, 58, 0.24);
    }

    www-footer {
      border-top: 1px solid rgba(61, 60, 58, 0.24);
    }
  `,
})
export default class EnterprisePage {}
