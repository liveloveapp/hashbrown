import Markdown from 'react-markdown';

export const MarkdownComponent = (props: { children: string }) => {
  const { children } = props;
  return <Markdown>{children}</Markdown>;
};
