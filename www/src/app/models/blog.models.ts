export interface PostAttributes {
  title: string;
  slug: string;
  date?: Date;
  description: string;
  tags: string[];
  team: string[];
  youtube?: string;
  ogImage?: string;
}

export type Filter = {
  kind: 'filter';
  text: string;
  query: string;
};

export const filter = (text: string, query: string): Filter => ({
  kind: 'filter',
  text,
  query,
});
