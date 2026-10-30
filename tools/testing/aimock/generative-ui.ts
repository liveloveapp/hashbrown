import { createUiJsonSchema, s, ɵcreateUiKit } from '@hashbrownai/core';

const metric = {
  name: 'metric',
  description: 'One labelled number. Use it only inside a card.',
  props: {
    label: s.string('What the number measures'),
    value: s.number('The number'),
  },
};

const card = {
  name: 'card',
  description: 'A titled card that groups metrics.',
  props: { title: s.string('The card title') },
  children: [metric],
};

/**
 * The user message for recorded generative UI cases. It asks for the nested
 * shape {@link parseGenerativeUi} checks: one card holding metrics.
 */
export const GENERATIVE_UI_PROMPT =
  'Show a card titled "Potato harvest" holding two metric components: acres planted (12) and tonnes picked (30).';

/**
 * The JSON Schema `useUiChat` sends for a card that nests metrics. It has the
 * features providers most often mishandle: `anyOf`, `$defs` and `$ref`.
 *
 * @returns A fresh copy, so a provider that rewrites it cannot leak into
 * another test.
 */
export function generativeUiResponseSchema(): Record<string, unknown> {
  return createUiJsonSchema({ components: [card] });
}

/** What a recorded generative UI response must render. */
export interface GenerativeUiCard {
  readonly title: string;
  readonly metrics: readonly {
    readonly label: string;
    readonly value: number;
  }[];
}

/**
 * Parses streamed generative UI content with the same UI kit schema the
 * browser uses, and reads the first card.
 *
 * @param content - The assistant message content.
 * @returns The first card's title and metrics.
 * @throws When the content is not valid JSON, breaks the UI schema, has no
 * card, or the card holds no metrics.
 */
export function parseGenerativeUi(content: string): GenerativeUiCard {
  const kit = ɵcreateUiKit({
    components: [
      { ...card, component: {}, children: [{ ...metric, component: {} }] },
    ],
  });
  const value = JSON.parse(content) as unknown;
  kit.schema.validate(value);

  const ui = (value as { ui: Record<string, ComponentNode>[] }).ui;
  const found = ui.find((node) => 'card' in node)?.['card'];
  if (!found) throw new Error(`No card in the generative UI: ${content}`);
  const metrics = (found.children ?? []).flatMap((child) =>
    child['metric']
      ? [child['metric'].props as unknown as GenerativeUiMetric]
      : [],
  );
  if (metrics.length === 0)
    throw new Error(`The card holds no metric: ${content}`);

  return {
    title: (found.props as unknown as { title: string }).title,
    metrics: metrics.map(({ label, value }) => ({ label, value })),
  };
}

interface ComponentNode {
  readonly props: Record<string, unknown>;
  readonly children?: readonly Record<string, ComponentNode>[];
}

interface GenerativeUiMetric {
  readonly label: string;
  readonly value: number;
}
