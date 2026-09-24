/** A navigation link. */
export type Link = { kind: 'link'; url: string; text: string };

/** A collapsible navigation section. */
export type Section = {
  kind: 'section';
  title: string;
  active: boolean;
  children: (Link | Section | LineBreak)[];
};

/** A visual break between navigation items. */
export type LineBreak = { kind: 'break' };

/** Any item a navigation list can hold. */
export type NavigationItem = Link | Section | LineBreak;

/**
 * Create a navigation link.
 *
 * @param text - The link text.
 * @param url - The link target.
 */
export const link = (text: string, url: string): Link => ({
  kind: 'link',
  url,
  text,
});

/**
 * Create a closed navigation section.
 *
 * @param title - The section title.
 * @param children - The items inside the section.
 */
export const section = (
  title: string,
  children: NavigationItem[],
): Section => ({
  kind: 'section',
  title,
  active: false,
  children,
});

/** Create a line break. */
export const lineBreak = (): LineBreak => ({ kind: 'break' });

/**
 * Open or close the section with the given title, returning new sections
 * and leaving the input untouched.
 *
 * @param sections - The current sections.
 * @param title - The title of the section to toggle.
 */
export function toggleSection<T extends NavigationItem>(
  sections: readonly T[],
  title: string,
): T[] {
  return sections.map((item) =>
    item.kind === 'section' && item.title === title
      ? { ...item, active: !item.active }
      : item,
  );
}
