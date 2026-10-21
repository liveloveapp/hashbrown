import { browserStorage, readShowStream, writeShowStream } from '@atc/shared';
import { Injectable, signal } from '@angular/core';

/**
 * Whether "Show the stream" is on: on for a first visit, then remembered in
 * localStorage. The header's switch sets it; the transcript, the tool lines
 * and the map read it.
 */
@Injectable({ providedIn: 'root' })
export class ShowStream {
  private readonly state = signal(readShowStream(browserStorage()));
  /** True while the dark JSON panels show. */
  readonly on = this.state.asReadonly();

  /** Turns the panels on or off and remembers the choice. */
  set(on: boolean): void {
    this.state.set(on);
    writeShowStream(browserStorage(), on);
  }
}
