import { Component, input } from '@angular/core';

@Component({
  selector: 'www-angular',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 96 100"
      fill="none"
      [style.height]="height()"
      [style.width]="width()"
    >
      <path
        d="M59.2297 0L91.8649 70.2297L95.2568 16.6622L59.2297 0Z"
        fill="#2f2f2b"
      />
      <path
        d="M67.6487 73.7973H28.3784L23.3649 85.9459L48.0135 100L72.6622 85.9459L67.6487 73.7973Z"
        fill="#2f2f2b"
      />
      <path
        d="M35.1082 58.0405H60.9325L48.0136 26.6487L35.1082 58.0405Z"
        fill="#2f2f2b"
      />
      <path
        d="M36.7973 0L0.770264 16.6622L4.16216 70.2297L36.7973 0Z"
        fill="#2f2f2b"
      />
    </svg>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      align-items: center;
    }
  `,
})
export class Angular {
  height = input<string>('24px');
  width = input<string>('24px');
}
