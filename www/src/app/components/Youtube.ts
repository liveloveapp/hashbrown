import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'www-youtube',
  template: `
    <iframe
      [src]="embeddedUrl()"
      [title]="title()"
      [width]="width()"
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      loading="lazy"
      credentialless="true"
    ></iframe>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    iframe {
      aspect-ratio: 16 / 9;
      width: 100%;
      height: auto;
    }
  `,
})
export class Youtube {
  src = input.required<string>();
  title = input<string>('YouTube Video');
  width = input<string>('100%');

  sanitizer = inject(DomSanitizer);

  videoId = computed(() => {
    const s = this.src();
    let match;

    // Check for 'https://www.youtube.com/embed/' format
    match = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }

    // Check for 'https://www.youtube.com/watch?v=' format
    match = s.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }

    match = s.match(/youtube\.com\/live\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }

    // Check for 'https://youtu.be/' format
    match = s.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }

    return undefined;
  });

  embeddedUrl = computed<SafeResourceUrl>(() => {
    const videoId = this.videoId();
    const url = `https://www.youtube.com/embed/${videoId}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });
}
