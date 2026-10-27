/** Produces labelled provider-native fixture JSON from the actual prompt and browser tool output. */
export function workbenchAuthoringFixtureText(
  lesson: string | undefined,
  input: readonly {
    readonly role?: string;
    readonly content?: unknown;
    readonly type?: string;
    readonly output?: unknown;
  }[],
): string | undefined {
  if (lesson !== 'json-parser' && lesson !== 'natural-forms') return undefined;
  const user = [...input].reverse().find((message) => message.role === 'user');
  const shorter = JSON.stringify(user?.content ?? '')
    .toLowerCase()
    .includes('shorter');
  let title = 'Lighthouse';
  let first = 'Outline the trusted UI demo.';
  if (lesson === 'natural-forms') {
    for (const message of input) {
      if (
        message.type !== 'function_call_output' ||
        typeof message.output !== 'string'
      )
        continue;
      try {
        const value = JSON.parse(message.output);
        if (
          typeof value?.plan?.title === 'string' &&
          typeof value?.plan?.steps?.[0] === 'string'
        ) {
          title = value.plan.title;
          first = value.plan.steps[0];
        }
      } catch {
        /* A fixture never invents context from an invalid tool result. */
      }
    }
  }
  return JSON.stringify({
    title,
    steps: [
      first,
      shorter
        ? 'Record the demo.'
        : 'Record a short demonstration of the trusted interface.',
    ],
  });
}
