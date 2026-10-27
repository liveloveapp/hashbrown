/** Supplies explicitly labelled deterministic provider text for the local workflow agent. */
export function workbenchWorkflowFixtureText(
  lesson: string | undefined,
  messages: readonly { readonly role?: string; readonly content?: unknown }[],
): string | undefined {
  if (!['shared-state', 'activities', 'interrupts'].includes(lesson ?? ''))
    return undefined;
  const user = [...messages]
    .reverse()
    .find((message) => message.role === 'user');
  return String(user?.content).toLowerCase().includes('shorter')
    ? 'Outline the trusted UI demo. Then record the demo.'
    : 'Your plan has two steps. Outline the trusted UI demo. Record the demo. The application owns the plan; this reply explains it without executing either step.';
}
