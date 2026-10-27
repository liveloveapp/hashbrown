import {
  getWorkbenchUiSystem,
  type WorkbenchUiLesson,
} from '../../examples/quickstart/runtime/workbench-ui-kits';

interface NativeInput {
  readonly role?: string;
  readonly type?: string;
  readonly content?: unknown;
  readonly output?: unknown;
}

/** Identifies only the pinned lesson policy at the provider-native fixture boundary. */
export function getWorkbenchUiFixtureLesson(
  input: readonly NativeInput[],
): WorkbenchUiLesson | undefined {
  const system = input.find((message) => message.role === 'system')?.content;
  return (['ui-kits', 'ui-chatbot'] as const).find(
    (lesson) => system === getWorkbenchUiSystem(lesson),
  );
}

/** Creates labelled fixture UI from the actual user request and latest supplied tool context. */
export function workbenchUiFixtureText(
  lesson: WorkbenchUiLesson | undefined,
  input: readonly NativeInput[],
): string | undefined {
  if (!lesson) return undefined;
  const user = [...input].reverse().find((message) => message.role === 'user');
  const prompt = typeof user?.content === 'string' ? user.content : '';
  let plan = {
    title: 'Trusted UI demo',
    steps: [
      'Outline the trusted UI demo.',
      'Record a short demonstration of the interface.',
    ],
  };
  const currentUser = input.map((message) => message.role).lastIndexOf('user');
  const result = input
    .slice(currentUser + 1)
    .filter((message) => message.type === 'function_call_output')
    .at(-1);
  if (typeof result?.output === 'string') {
    try {
      const context = JSON.parse(result.output);
      if (
        typeof context?.plan?.title === 'string' &&
        Array.isArray(context?.plan?.steps) &&
        context.plan.steps.length === 2 &&
        context.plan.steps.every((step: unknown) => typeof step === 'string')
      ) {
        plan = { title: context.plan.title, steps: [...context.plan.steps] };
      }
    } catch {
      /* Invalid fixture context never invents accepted data. */
    }
  }
  const component =
    lesson === 'ui-kits' && prompt.includes('StepsCard')
      ? 'StepsCard'
      : lesson === 'ui-chatbot' && prompt.includes('PlanReading')
        ? 'PlanReading'
        : 'SummaryCard';
  return JSON.stringify({
    ui: [
      {
        [component]: {
          props: {
            ...plan,
            steps:
              component === 'StepsCard'
                ? [plan.steps[0], 'Record it.']
                : plan.steps,
          },
        },
      },
    ],
  });
}
