import type { VoiceIssue } from '../voice/check.ts';

const OFFSET_TIMESTAMP = /(?:Z|[+-]\d{2}:\d{2})$/;

function frontmatterField(markdown: string, name: string): string | undefined {
  const front = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? '';
  return new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm')
    .exec(front)?.[1]
    ?.replace(/^(['"])(.*)\1$/, '$2');
}

/**
 * Checks that a blog file goes public at its slot: `published: true` and a
 * `publishAt` (quoted, with an offset) at the same instant as `scheduledAt`.
 * The site hides the post until then, and dispatch holds the blog and its
 * promos if it is not live within 2 hours of the slot.
 *
 * @param markdown - The blog file.
 * @param scheduledAt - The blog row's slot.
 */
export function blogScheduleIssue(
  markdown: string,
  scheduledAt: Date,
): VoiceIssue | undefined {
  const slot = scheduledAt.toISOString();
  if (frontmatterField(markdown, 'published') !== 'true') {
    return {
      rule: 'blog_schedule',
      message: 'Blog frontmatter needs published: true.',
    };
  }
  const raw = frontmatterField(markdown, 'publishAt');
  const at = raw && OFFSET_TIMESTAMP.test(raw) ? new Date(raw) : undefined;
  if (!at || Number.isNaN(at.getTime())) {
    return {
      rule: 'blog_schedule',
      message: `Blog frontmatter needs a quoted publishAt with an offset at the slot (${slot}).`,
    };
  }
  if (at.getTime() !== scheduledAt.getTime()) {
    return {
      rule: 'blog_schedule',
      message: `Blog publishAt ${at.toISOString()} is not the slot ${slot}.`,
    };
  }
  return undefined;
}
