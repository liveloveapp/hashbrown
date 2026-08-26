import { expect, type Locator, type Page } from '@playwright/test';

/** Shared browser driver for runtime smoke fixture interactions and assertions. */
export class AppDriver {
  /** Creates a driver for one fixture page. */
  constructor(private readonly page: Page) {}

  /** Sends the current prompt through the fixture UI. */
  async send(text: string): Promise<void> {
    await this.page.getByTestId('prompt').fill(text);
    await this.page.getByTestId('send').click();
  }

  /** Stops the active fixture request. */
  async stop(): Promise<void> {
    await this.page.getByTestId('stop').click();
  }

  /** Waits for the fixture to report its idle state. */
  async expectIdle(): Promise<void> {
    await expect(this.page.getByTestId('status')).toHaveText('idle');
  }

  /** Waits for the fixture to report its loading state. */
  async expectLoading(): Promise<void> {
    await expect(this.page.getByTestId('status')).toHaveText('loading');
  }

  /** Returns the rendered user message locator. */
  userMessage(): Locator {
    return this.page.getByTestId('user-message');
  }

  /** Returns the rendered assistant response locator. */
  assistant(): Locator {
    return this.page.getByTestId('assistant');
  }

  /** Returns the general error locator. */
  error(): Locator {
    return this.page.getByTestId('error');
  }

  /** Returns the send-phase error locator. */
  sendingError(): Locator {
    return this.page.getByTestId('sending-error');
  }

  /** Returns the generation-phase error locator. */
  generatingError(): Locator {
    return this.page.getByTestId('generating-error');
  }

  /** Returns the observed tool call count locator. */
  toolCount(): Locator {
    return this.page.getByTestId('tool-count');
  }

  /** Returns the structured answer locator. */
  structuredAnswer(): Locator {
    return this.page.getByTestId('structured-answer');
  }

  /** Returns the structured response count locator. */
  structuredCount(): Locator {
    return this.page.getByTestId('structured-count');
  }

  /** Returns the generated UI status card locator. */
  statusCard(): Locator {
    return this.page.getByTestId('status-card');
  }
}
