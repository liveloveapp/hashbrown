import { AnalyticsEvent } from '../../services/AnalyticsService';

/**
 * Dependencies for {@link copyText}. Passed in so the function stays pure and testable.
 */
export interface CopyTextDeps {
  clipboard: Pick<Clipboard, 'writeText'> | undefined;
  track: (event: AnalyticsEvent) => void;
}

/**
 * Copy text to the clipboard and track the event only if the copy succeeded.
 *
 * @param text - The text to copy.
 * @param event - The analytics event to send on success.
 * @param deps - The clipboard and tracker to use.
 * @returns Whether the copy succeeded.
 */
export async function copyText(
  text: string,
  event: AnalyticsEvent,
  deps: CopyTextDeps,
): Promise<boolean> {
  if (!deps.clipboard) {
    return false;
  }
  try {
    await deps.clipboard.writeText(text);
  } catch {
    return false;
  }
  deps.track(event);
  return true;
}
