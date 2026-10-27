/** Builds plain text from actual supplied history; live requests never use this fixture. */
export function workbenchHistoryFixtureText(
  lesson: string | undefined,
  messages: readonly { readonly role?: string; readonly content?: unknown }[],
): string | undefined {
  if (!['message-history', 'save-text-conversations'].includes(lesson ?? ''))
    return undefined;
  const named = messages.find(
    (message) =>
      message.role === 'user' &&
      /Lighthouse|Harbor/.test(JSON.stringify(message.content)),
  );
  const name = !named
    ? 'The plan'
    : JSON.stringify(named.content).includes('Harbor')
      ? 'Harbor'
      : 'Lighthouse';
  return `${name}: outline the trusted UI demo first, then record the demo. The second step is to record the demo.`;
}
