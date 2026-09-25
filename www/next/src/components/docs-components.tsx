import type { ReactNode } from 'react';
import type { MarkdownComponents } from '../lib/markdown';
import { CodeExample } from './CodeExample';
import { BackendCodeExample } from './elements/BackendCodeExample';
import { Carousel } from './elements/Carousel';
import { MagicTextDemo } from './elements/MagicTextDemo';
import { Expander } from './Expander';
import {
  BoltIcon,
  CodeIcon,
  ComponentsIcon,
  DatabaseCogIcon,
  FunctionsIcon,
  MessageIcon,
  SendIcon,
} from './icons';
import { NextStep, NextSteps } from './NextSteps';
import { SymbolLink } from './SymbolLink';

/**
 * The element map for docs and blog markdown. Elements not listed here render
 * as marked placeholders (see `renderMarkdown`).
 *
 * @param sdk - The SDK whose docs are rendering; resolves relative next-step links.
 * @param popovers - Server-rendered popover bodies by canonical reference, for
 *   the symbol links this page contains (see `renderDocsMarkdown`). Links
 *   without an entry render without a popover.
 */
export function docsComponents(
  sdk: string,
  popovers: ReadonlyMap<string, ReactNode> = new Map(),
): MarkdownComponents {
  const DocsNextStep = (props: { link?: string; children?: ReactNode }) => (
    <NextStep {...props} sdk={sdk} />
  );
  const DocsSymbolLink = ({ reference = '' }: { reference?: string }) => (
    <SymbolLink reference={reference} popover={popovers.get(reference)} />
  );
  return {
    'hb-code-example': CodeExample,
    'hb-backend-code-example': BackendCodeExample,
    'hb-carousel': Carousel,
    'hb-magic-text-demo': MagicTextDemo,
    'hb-next-steps': NextSteps,
    'hb-next-step': DocsNextStep,
    'hb-expander': Expander,
    'hb-symbol-link': DocsSymbolLink,
    'hb-code': () => <CodeIcon />,
    'hb-components': () => <ComponentsIcon />,
    'hb-functions': () => <FunctionsIcon />,
    'hb-send': () => <SendIcon />,
    'hb-database-cog': () => <DatabaseCogIcon />,
    'hb-message': () => <MessageIcon />,
    'hb-bolt': () => <BoltIcon />,
  };
}
