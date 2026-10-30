import type { ReactNode } from 'react';
import type { Sdk } from '../lib/content';
import type { MarkdownComponents } from '../lib/markdown';
import type { WorkbenchPageData } from '../lib/workbench-source-files';
import { CodeExample } from './CodeExample';
import { AtcDemoVideo } from './elements/AtcDemoVideo';
import { BackendCodeExample } from './elements/BackendCodeExample';
import { Carousel } from './elements/Carousel';
import { ConceptDiagram } from './elements/ConceptDiagram';
import { DocsDemoVideo } from './elements/DocsDemoVideo';
import { MagicTextDemo } from './elements/MagicTextDemo';
import { ScrollTable } from './elements/ScrollTable';
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
import { WorkbenchPanel } from './workbench/WorkbenchPanel';
import { DocsDiagram } from './diagrams/DocsDiagram';
import { assertWorkbenchLesson } from './workbench/workbench-lessons';

/**
 * The element map for docs and blog markdown. Elements not listed here render
 * as marked placeholders (see `renderMarkdown`).
 *
 * @param sdk - The SDK whose docs are rendering; resolves relative next-step links.
 * @param popovers - Server-rendered popover bodies by canonical reference, for
 *   the symbol links this page contains (see `renderDocsMarkdown`). Links
 *   without an entry render without a popover.
 * @param workbench - The page's workbench data (see `workbenchPageData`):
 *   the Source tab's files and highlights for its `hb-workbench` lesson. A
 *   panel without it has no Source tab.
 */
export function docsComponents(
  sdk: string,
  popovers: ReadonlyMap<string, ReactNode> = new Map(),
  workbench?: WorkbenchPageData,
): MarkdownComponents {
  const DocsNextStep = (props: { link?: string; children?: ReactNode }) => (
    <NextStep {...props} sdk={sdk} />
  );
  const DocsSymbolLink = ({ reference = '' }: { reference?: string }) => (
    <SymbolLink reference={reference} popover={popovers.get(reference)} />
  );
  // Blog posts and API summaries render as React.
  const panelSdk: Sdk = sdk === 'angular' ? 'angular' : 'react';
  const DocsWorkbench = ({ lesson = '' }: { lesson?: string }) => {
    const id = assertWorkbenchLesson(lesson);
    const page = workbench?.lesson === id ? workbench : undefined;
    return (
      <WorkbenchPanel
        lesson={id}
        sdk={panelSdk}
        source={page?.source}
        moments={page?.moments}
      />
    );
  };
  return {
    table: ScrollTable,
    'hb-code-example': CodeExample,
    'hb-backend-code-example': BackendCodeExample,
    'hb-carousel': Carousel,
    'www-atc-demo-video': AtcDemoVideo,
    'hb-docs-demo': DocsDemoVideo,
    'hb-concept-diagram': ConceptDiagram,
    'hb-diagram': DocsDiagram,
    'hb-workbench': DocsWorkbench,
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
