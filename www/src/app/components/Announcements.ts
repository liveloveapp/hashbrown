import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'www-announcements',
  imports: [RouterLink],
  template: ` Coming Soon - Live workshops! `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #9ecfd7;
      padding-top: 8px;
      padding-bottom: 8px;
    }
  `,
})
export class Announcements {}
