export type Link = { kind: 'link'; url: string; text: string };
export type Section = {
  kind: 'section';
  title: string;
  children: (Link | Section | LineBreak)[];
};
export type LineBreak = { kind: 'break' };
export type FlattenedLink = { url: string; text: string; parents: string[] };

export const link = (text: string, url: string): Link => ({
  kind: 'link',
  url,
  text,
});

export const section = (
  title: string,
  children: (Link | Section | LineBreak)[],
): Section => ({
  kind: 'section',
  title,
  children,
});

export const lineBreak = (): LineBreak => ({ kind: 'break' });
