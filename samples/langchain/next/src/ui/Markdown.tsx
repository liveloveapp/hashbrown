import { exposeComponent } from '@hashbrownai/react';
import ReactMarkdown from 'react-markdown';

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown>{children}</ReactMarkdown>;
}

Markdown.displayName = 'Markdown';

const exposedMarkdown = exposeComponent(Markdown, {
  name: 'Markdown',
  description: 'Show markdown to the user',
  children: 'text' as const,
});

export default Markdown;
export { exposedMarkdown };
