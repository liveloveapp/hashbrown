import { Component } from '@angular/core';

@Component({
  selector: 'www-texture',
  template: `<ng-content />`,
  styles: `
    :host {
      background-color: var(--vanilla-ivory, #faf9f0);
      background-image: url('/image/texture/fabric.png');
      background-size: auto;
      background-repeat: repeat;
      background-position: center;
      background-attachment: fixed;
    }
  `,
})
export class Texture {}
