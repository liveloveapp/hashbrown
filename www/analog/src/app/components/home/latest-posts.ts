import { ContentFile } from '@analogjs/content';
import { PostAttributes } from '../../models/blog.models';

/**
 * Return the newest blog posts, each with a `date` parsed from its `YYYY-MM-DD` slug prefix.
 *
 * @param files - Blog content files.
 * @param count - How many posts to return.
 */
export function selectLatestPosts<
  T extends Pick<ContentFile<PostAttributes>, 'attributes'>,
>(
  files: readonly T[],
  count: number,
): Array<T & { attributes: T['attributes'] & { date: Date } }> {
  return files
    .map((file) => ({
      ...file,
      attributes: {
        ...file.attributes,
        date: new Date(file.attributes.slug.slice(0, 10)),
      },
    }))
    .sort(
      (a, b) =>
        (b.attributes.date.getTime() || 0) - (a.attributes.date.getTime() || 0),
    )
    .slice(0, count);
}
