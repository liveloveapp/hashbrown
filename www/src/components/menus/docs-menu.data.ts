import type { Sdk } from '../../lib/content';

/** One docs-menu entry as written in the Angular `DocsMenu` template. */
interface DocsMenuEntry {
  text: string;
  /** Path below `/docs/<sdk>/`. */
  path: string;
  /** Limit the entry to these SDKs; every SDK when omitted. */
  sdks?: readonly Sdk[];
}

interface DocsMenuSectionEntry {
  title: string;
  /** Rendered as `<ol>` when true, `<ul>` otherwise, as in Angular. */
  ordered: boolean;
  entries: readonly DocsMenuEntry[];
}

/** A resolved docs-menu link. */
export interface DocsMenuLink {
  text: string;
  href: string;
}

/** A resolved docs-menu section. */
export interface DocsMenuSection {
  title: string;
  ordered: boolean;
  links: DocsMenuLink[];
}

/**
 * Links in the docs menu that are not docs pages. The Angular menu has none;
 * add a link here only when the menu really has one.
 */
export const NON_DOCS_LINKS: readonly string[] = [];

const DOCS_MENU: readonly DocsMenuSectionEntry[] = [
  {
    title: 'Getting Started',
    ordered: false,
    entries: [
      { text: 'Introduction', path: 'start/intro' },
      { text: 'Quickstart', path: 'start/quick' },
      { text: 'Example app', path: 'start/sample' },
      { text: 'API Overview', path: 'start/overview' },
    ],
  },
  {
    title: 'Migrations',
    ordered: false,
    entries: [
      { text: 'Upgrade to v0.6', path: 'migrations/v0-6' },
      { text: 'Upgrade to v0.5', path: 'migrations/v0-5' },
    ],
  },
  {
    title: 'Guide',
    ordered: true,
    entries: [
      { text: '1. Basics of AI', path: 'concept/ai-basics' },
      { text: '2. System Instructions', path: 'concept/system-instructions' },
      { text: '3. Message History', path: 'concept/message-history' },
      { text: '4. Skillet Schema', path: 'concept/schema' },
      { text: '5. Streaming', path: 'concept/streaming' },
      { text: '6. Tool Calling', path: 'concept/functions' },
      { text: '7. Structured Output', path: 'concept/structured-output' },
      { text: '8. Generative UI', path: 'concept/components' },
      { text: '9. JavaScript Runtime', path: 'concept/runtime' },
    ],
  },
  {
    title: 'Recipes',
    ordered: true,
    entries: [
      {
        text: 'Natural Language Forms',
        path: 'recipes/natural-language-to-structured-data',
      },
      { text: 'UI Chatbot with Tools', path: 'recipes/ui-chatbot' },
      { text: 'UI Kits', path: 'recipes/ui-kits' },
      { text: 'Predictive Suggestions', path: 'recipes/predictive-actions' },
      { text: 'Remote MCP', path: 'recipes/remote-mcp' },
      { text: 'Threads', path: 'recipes/threads' },
      { text: 'Magic Text', path: 'recipes/magic-text' },
      { text: 'JSON Parser', path: 'recipes/json-parser' },
      { text: 'CopilotKit', path: 'recipes/copilotkit', sdks: ['react'] },
      { text: 'Local Models', path: 'recipes/local-models' },
    ],
  },
  {
    title: 'Platforms',
    ordered: false,
    entries: [
      { text: 'OpenAI', path: 'platform/openai' },
      { text: 'Anthropic', path: 'platform/anthropic' },
      { text: 'Google', path: 'platform/google' },
      { text: 'Azure', path: 'platform/azure' },
      { text: 'Amazon Bedrock', path: 'platform/bedrock' },
      { text: 'Ollama', path: 'platform/ollama' },
    ],
  },
];

/**
 * The docs-menu sections for an SDK, with hrefs resolved to `/docs/<sdk>/…`
 * and SDK-specific entries filtered.
 *
 * @param sdk - The SDK whose docs the menu links to.
 */
export function docsMenuSections(sdk: Sdk): DocsMenuSection[] {
  return DOCS_MENU.map(({ title, ordered, entries }) => ({
    title,
    ordered,
    links: entries
      .filter((entry) => !entry.sdks || entry.sdks.includes(sdk))
      .map((entry) => ({
        text: entry.text,
        href: `/docs/${sdk}/${entry.path}`,
      })),
  }));
}
