import ReactMarkdown from 'react-markdown';

export const Markdown = (props: { children: string }) => {
  const { children } = props;
  return <ReactMarkdown>{children}</ReactMarkdown>;
};
