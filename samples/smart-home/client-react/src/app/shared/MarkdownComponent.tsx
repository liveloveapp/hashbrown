import Markdown from 'react-markdown';

export const MarkdownComponent = (props: { content: string }) => {
  const { content } = props;
  return <Markdown>{content}</Markdown>;
};
