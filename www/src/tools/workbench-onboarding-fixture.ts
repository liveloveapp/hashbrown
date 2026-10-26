/** Builds explicitly scripted onboarding text without tools; live requests never use it. */
export function workbenchOnboardingFixtureText(
  lesson: string | undefined,
  messages: readonly { readonly role?: string; readonly content?: unknown }[],
): string | undefined {
  if (lesson === 'first-plan')
    return JSON.stringify({
      ui: [
        {
          SummaryCard: {
            props: {
              title: 'Show a trusted component',
              steps: ['Outline the trusted UI demo', 'Record the demo'],
            },
          },
        },
      ],
    });
  if (lesson === 'conversation') {
    const named = messages.some(
      (message) =>
        message.role === 'user' &&
        String(message.content).includes('Lighthouse'),
    );
    const followup =
      messages.filter((message) => message.role === 'user').length > 1;
    return named
      ? followup
        ? 'You named your plan Lighthouse. Next, record the demo.'
        : 'Lighthouse starts with outlining the trusted UI demo.'
      : 'Outline the demo first, then record it.';
  }
  if (lesson === 'system-instructions')
    return 'The application plan is Show how a model renders trusted UI. First, Outline the trusted UI demo. Next, Record the demo.';
  return undefined;
}
