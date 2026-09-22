import { RouteMeta } from '@analogjs/router';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Footer } from '../../components/Footer';
import { Header } from '../../components/Header';
import { Samples } from '../../components/home/Samples';

export const routeMeta: RouteMeta = {
  title: 'Hashbrown Invoicing Example',
  meta: [
    {
      name: 'description',
      content:
        'Explore the React, B4 and Pretable invoicing example with a simulated ledger and explicit allocation reviews.',
    },
  ],
};

@Component({
  imports: [Header, Samples, Footer],
  template: `
    <www-header />
    <main>
      <h1>Hashbrown example</h1>
      <www-samples />
    </main>
    <www-footer />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    h1 {
      text-align: center;
      margin: 32px 16px;
      font:
        750 40px/1.2 KefirVariable,
        sans-serif;
    }
  `,
})
export default class SamplesPage {}
