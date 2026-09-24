/**
 * Copy text to the clipboard.
 *
 * @param text - The text to copy.
 * @param clipboard - The clipboard to write to, or `undefined` when unavailable (for example during SSR).
 * @returns Whether the copy succeeded.
 */
export async function copyText(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined,
): Promise<boolean> {
  if (!clipboard) {
    return false;
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
