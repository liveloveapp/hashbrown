export interface PostAttributes {
  title: string;
  slug: string;
  description: string;
  tags: string[];
  team: string[];
  youtube?: string;
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
