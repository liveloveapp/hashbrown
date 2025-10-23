import { Component, input } from '@angular/core';

@Component({
  selector: 'www-hashbrown',
  template: ` <img src="/image/logo/word-mark.svg" /> `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      align-items: center;
    }
  `,
})
export class Hashbrown {
  height = input<string>('78px');
  width = input<string>('420px');
  stroke = input<string>('#FBBB52');
}
