import { AppConfig } from '../../services/ConfigService';

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

/**
 * The quick start docs URL for a framework.
 *
 * @param sdk - The selected framework.
 */
export function quickStartUrl(sdk: Sdk): string {
  return `/docs/${sdk}/start/quick`;
}

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
    body: 'The model can only render what you register, with props validated by a Skillet schema.',
  },
  {
    title: 'Give it tools',
    body: "Tools run in the browser, with your app's state and services.",
  },
  {
    title: 'Render the stream',
    body: 'Components render as they stream in. No waiting for the full response.',
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
  m.role === 'assistant' ? m.ui : m.content
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
  why: string;
  docsPath: [string, string];
  tint: string;
}

/**
 * The six capability groups. `docsPath` is relative to `/docs/{sdk}/`.
 */
export const CAPABILITIES: Capability[] = [
  {
    title: 'Generative UI',
    body: 'The model composes your trusted components. UI kits bundle them for reuse.',
    why: 'Only your components, never arbitrary HTML',
    docsPath: ['concept', 'components'],
    tint: 'var(--sunshine-yellow-light)',
  },
  {
    title: 'Client-side tools',
    body: "Call your app's functions from the model, and connect MCP servers when you need them.",
    why: 'Runs in the browser, not just on a server',
    docsPath: ['concept', 'functions'],
    tint: 'var(--sky-blue-light)',
  },
  {
    title: 'Structured output',
    body: 'Skillet schemas give you typed JSON you can use directly.',
    why: 'A schema language built for LLMs and streaming',
    docsPath: ['concept', 'structured-output'],
    tint: 'var(--sunset-orange-light)',
  },
  {
    title: 'Streaming, everywhere',
    body: 'Strings, arrays, and objects parse as they arrive. Magic Text streams markdown.',
    why: 'Incremental parser, low latency',
    docsPath: ['concept', 'streaming'],
    tint: 'var(--olive-green-light)',
  },
  {
    title: 'Any model',
    body: 'OpenAI, Anthropic, Gemini, Bedrock, Azure, Ollama, and local browser models.',
    why: 'Swap providers without rewriting UI',
    docsPath: ['platform', 'openai'],
    tint: 'var(--sunshine-yellow-light)',
  },
  {
    title: 'Safe code execution',
    body: 'A sandboxed JavaScript runtime for model-written code.',
    why: 'Charts and transforms without eval',
    docsPath: ['concept', 'runtime'],
    tint: 'var(--sky-blue-light)',
  },
];

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
