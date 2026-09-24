import type { AppConfig } from '../../lib/site-config';

/**
 * A framework the homepage can show.
 */
export type Sdk = AppConfig['sdk'];

/**
 * The display name for each framework.
 */
export const SDK_LABELS: Record<Sdk, string> = {
  react: 'React',
  angular: 'Angular',
};

/**
 * The npm install command for a framework.
 *
 * @param sdk - The selected framework.
 */
export function installCommand(sdk: Sdk): string {
  return `npm i @hashbrownai/{core,${sdk},openai}`;
}

/**
 * A prompt a developer can paste into a coding agent to add Hashbrown to their app.
 *
 * @param sdk - The selected framework.
 */
export function agentPrompt(sdk: Sdk): string {
  const name = SDK_LABELS[sdk];
  return [
    `Add Hashbrown to this ${name} app.`,
    `Read https://hashbrown.dev/llms.txt first and follow the ${name} quick start.`,
    `Install the packages with: ${installCommand(sdk)}`,
    'Add a small chat that renders one of our existing components with generative UI,',
    'and expose one read-only client-side tool. Keep the API key on the server.',
  ].join('\n');
}

/** The quick start docs URL for a framework (shared with the site header). */
export { quickStartUrl } from '../site/links';

/**
 * A code sample with its file name.
 */
export interface CodeSample {
  file: string;
  lang: string;
  code: string;
}

/**
 * The hero code sample for each framework.
 */
export const HERO_CODE: Record<Sdk, CodeSample> = {
  react: {
    file: 'Assistant.tsx',
    lang: 'tsx',
    code: `const invoiceKit = useUiKit({
  components: [
    exposeComponent(InvoiceCard, {
      description: 'Show one invoice',
      props: { id: s.string('Invoice id') },
    }),
    exposeComponent(AgingChart, { /* … */ }),
  ],
});

const chat = useUiChat({
  system: 'Help users understand invoices.',
  components: [invoiceKit],
});`,
  },
  angular: {
    file: 'assistant.component.ts',
    lang: 'typescript',
    code: `export const invoiceKit = createUiKit({
  components: [
    exposeComponent(InvoiceCard, {
      description: 'Show one invoice',
      input: { id: s.string('Invoice id') },
    }),
    exposeComponent(AgingChart, { /* … */ }),
  ],
});

chat = uiChatResource({
  system: 'Help users understand invoices.',
  components: [invoiceKit],
});`,
  },
};

/**
 * One step in the "How it works" section.
 */
export interface Step {
  title: string;
  body: string;
  code: string;
  /** The syntax-highlighting language for `code`. Defaults to `typescript`. */
  lang?: string;
}

const STEP_COPY = [
  {
    title: 'Expose your components',
    body: 'The model only renders components you register. Skillet validates their props.',
  },
  {
    title: 'Give it tools',
    body: "Tools run in the browser, with your app's state and services.",
  },
  {
    title: 'Render the stream',
    body: 'Components render while the response streams in.',
  },
];

/**
 * The three "How it works" steps for each framework.
 */
export const STEPS: Record<Sdk, Step[]> = {
  react: [
    {
      ...STEP_COPY[0],
      code: `exposeComponent(AgingChart, {
  props: { buckets: s.array(…) },
})`,
    },
    {
      ...STEP_COPY[1],
      code: `useTool({
  name: 'getInvoices',
  handler: () => api.list(),
})`,
    },
    {
      ...STEP_COPY[2],
      code: `chat.messages.map((m) =>
  m.role === 'assistant'
    ? m.ui
    : m.content
)`,
    },
  ],
  angular: [
    {
      ...STEP_COPY[0],
      code: `exposeComponent(AgingChart, {
  input: { buckets: s.array(…) },
})`,
    },
    {
      ...STEP_COPY[1],
      code: `createTool({
  name: 'getInvoices',
  handler: () => api.list(),
})`,
    },
    {
      ...STEP_COPY[2],
      code: `<hb-render-message [message]="m" />`,
      lang: 'html',
    },
  ],
};

/**
 * One capability group on the homepage.
 */
export interface Capability {
  title: string;
  body: string;
  docsPath: [string, string];
}

/**
 * The six capability groups. `docsPath` is relative to `/docs/{sdk}/`.
 */
export const CAPABILITIES: Capability[] = [
  {
    title: 'Generative UI',
    body: 'The model composes your components. Bundle them into UI kits.',
    docsPath: ['concept', 'components'],
  },
  {
    title: 'Client-side tools',
    body: 'The model calls functions in your app. Connect MCP servers too.',
    docsPath: ['concept', 'functions'],
  },
  {
    title: 'Structured output',
    body: 'Skillet schemas turn model output into typed JSON.',
    docsPath: ['concept', 'structured-output'],
  },
  {
    title: 'Streaming',
    body: 'Strings, arrays, and objects parse as they arrive. Magic Text streams Markdown.',
    docsPath: ['concept', 'streaming'],
  },
  {
    title: 'Any model',
    body: 'OpenAI, Anthropic, Gemini, Bedrock, Azure, Ollama, or a model in the browser.',
    docsPath: ['platform', 'openai'],
  },
  {
    title: 'Code execution',
    body: 'Run model-written JavaScript in a sandbox.',
    docsPath: ['concept', 'runtime'],
  },
];

/**
 * The docs URL for a capability in the selected framework.
 *
 * @param sdk - The selected framework.
 * @param capability - The capability to link to.
 */
export function capabilityDocsUrl(sdk: Sdk, capability: Capability): string {
  return `/docs/${sdk}/${capability.docsPath.join('/')}`;
}

/**
 * The threadplane link used by the homepage banner.
 */
export const THREADPLANE_URL =
  'https://threadplane.ai/?utm_source=hashbrown&utm_medium=homepage&utm_campaign=headful_banner';

/**
 * External links for the invoicing showcase.
 */
export const INVOICING_LINKS = {
  app: 'https://invoicing.hashbrown.dev',
  source:
    'https://github.com/liveloveapp/hashbrown/tree/main/examples/invoicing',
  b4: 'https://b4.run',
  pretable: 'https://pretable.ai',
} as const;

/**
 * The Hashbrown GitHub repository.
 */
export const GITHUB_URL = 'https://github.com/liveloveapp/hashbrown';

/**
 * Build one value per framework, for example the two variants a
 * `SdkSwitch` chooses between.
 *
 * @param render - Produces the value for a framework.
 */
export function bySdk<T>(render: (sdk: Sdk) => T): Record<Sdk, T> {
  return { react: render('react'), angular: render('angular') };
}
