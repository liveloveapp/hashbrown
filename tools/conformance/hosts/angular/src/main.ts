import { provideHashbrown } from '@hashbrownai/angular';
import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';

function showStartupError(error: unknown): never {
  const startupError =
    error instanceof Error ? error : new Error(String(error));
  document.body.textContent = startupError.message;
  throw startupError;
}

function readRunUrl(): string {
  const value = new URL(globalThis.location.href).searchParams.get('runUrl');
  if (!value) {
    return showStartupError(
      new Error('Missing required runUrl query parameter.'),
    );
  }

  let runUrl: URL;
  try {
    runUrl = new URL(value);
  } catch {
    return showStartupError(new Error('runUrl must be a valid HTTP(S) URL.'));
  }

  if (runUrl.protocol !== 'http:' && runUrl.protocol !== 'https:') {
    return showStartupError(new Error('runUrl must use http: or https:.'));
  }

  return runUrl.href;
}

const runUrl = readRunUrl();

bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    provideHashbrown({ baseUrl: runUrl }),
  ],
}).catch(showStartupError);
