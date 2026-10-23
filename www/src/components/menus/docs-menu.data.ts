import type { Sdk } from '../../lib/content';

/** One documentation entry, shared by both SDK navigation menus. */
interface DocsMenuEntry {
  text: string;
  /** Path below `/docs/<sdk>/`. */
  path: string;
  /** Limit the entry to these SDKs; every SDK when omitted. */
  sdks?: readonly Sdk[];
}

interface DocsMenuSectionEntry {
  title: string;
  /** Rendered as `<ol>` when true, `<ul>` otherwise. */
  ordered: boolean;
  /** Display this group as an initially closed disclosure. */
  collapsible?: boolean;
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
  collapsible: boolean;
  links: DocsMenuLink[];
}

/**
 * Links in the docs menu that are not docs pages. The Angular menu has none;
 * add a link here only when the menu really has one.
 */
export const NON_DOCS_LINKS: readonly string[] = [];

const DOCS_MENU: readonly DocsMenuSectionEntry[] = [
  {
    title: 'Getting started',
    ordered: false,
    entries: [
      { text: 'Introduction', path: 'start/intro' },
      { text: 'Quickstart', path: 'start/quick' },
      { text: 'Example app', path: 'start/sample' },
      { text: 'Choosing an API', path: 'start/overview' },
    ],
  },
  {
    title: 'Fundamentals',
    ordered: false,
    entries: [
      { text: 'Messages and turns', path: 'concept/ai-basics' },
      { text: 'System instructions', path: 'concept/system-instructions' },
      { text: 'Message history', path: 'concept/message-history' },
      { text: 'Streaming', path: 'concept/streaming' },
      { text: 'Tool calling', path: 'concept/functions' },
      { text: 'Debugging', path: 'concept/debugging' },
    ],
  },
  {
    title: 'Generative UI',
    ordered: false,
    entries: [
      { text: 'Skillet schemas', path: 'concept/schema' },
      { text: 'Structured output', path: 'concept/structured-output' },
      { text: 'Exposing components', path: 'concept/components' },
      { text: 'UI kits', path: 'recipes/ui-kits' },
    ],
  },
  {
    title: 'Agent workflows',
    ordered: false,
    entries: [
      { text: 'Decisions', path: 'concept/decisions' },
      { text: 'Shared agent state', path: 'concept/shared-agent-state' },
      { text: 'Interrupt and resume', path: 'concept/interrupt-and-resume' },
      { text: 'Activities', path: 'concept/activities' },
      { text: 'JavaScript runtime', path: 'concept/runtime' },
    ],
  },
  {
    title: 'Recipes',
    ordered: false,
    entries: [
      {
        text: 'Natural Language Forms',
        path: 'recipes/natural-language-to-structured-data',
      },
      { text: 'UI Chatbot with Tools', path: 'recipes/ui-chatbot' },
      { text: 'UI Selection', path: 'recipes/ui-selection' },
      { text: 'Decisions in Agents', path: 'recipes/decisions-in-agents' },
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
    title: 'Production guides',
    ordered: false,
    entries: [
      { text: 'Securing a public endpoint', path: 'recipes/public-endpoint' },
      {
        text: 'Request customization',
        path: 'concept/transform-request-options',
      },
      { text: 'Choosing a model', path: 'guide/choosing-model' },
      { text: 'Prompt engineering', path: 'guide/prompt-engineering' },
      { text: 'Responsible AI UX', path: 'guide/ethics' },
    ],
  },
  {
    title: 'Model providers',
    ordered: false,
    entries: [
      { text: 'OpenAI', path: 'platform/openai' },
      { text: 'Anthropic', path: 'platform/anthropic' },
      { text: 'Google', path: 'platform/google' },
      { text: 'Azure', path: 'platform/azure' },
      { text: 'Amazon Bedrock', path: 'platform/bedrock' },
      { text: 'Ollama', path: 'platform/ollama' },
      { text: 'TypeSafe', path: 'platform/typesafe' },
    ],
  },
  {
    title: 'Migrations',
    ordered: false,
    collapsible: true,
    entries: [
      { text: 'Upgrade to v0.8', path: 'migrations/v0-8' },
      { text: 'Upgrade to v0.7', path: 'migrations/v0-7' },
      { text: 'Upgrade to v0.6', path: 'migrations/v0-6' },
      { text: 'Upgrade to v0.5', path: 'migrations/v0-5' },
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
  return DOCS_MENU.map(({ title, ordered, collapsible = false, entries }) => ({
    title,
    ordered,
    collapsible,
    links: entries
      .filter((entry) => !entry.sdks || entry.sdks.includes(sdk))
      .map((entry) => ({
        text: entry.text,
        href: `/docs/${sdk}/${entry.path}`,
      })),
  }));
}
