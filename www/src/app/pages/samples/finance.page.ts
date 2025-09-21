import { Component } from '@angular/core';
import { Header } from '../../components/Header';

@Component({
  imports: [Header],
  template: `
    <www-header />
    <iframe src="https://finance.hashbrown.dev"></iframe>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    iframe {
      flex: 1 auto;
      width: 100%;
      border: none;
    }
  `,
})
export default class FinanceSamplePage {}
