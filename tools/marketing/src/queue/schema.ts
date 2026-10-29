import { z } from 'zod';

const TIME_ZONE = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;

const link = z.object({ url: z.url(), previewTitle: z.string().optional() });

const xDraft = z.strictObject({
  channel: z.literal('x'),
  text: z.string().min(1),
  link: link.optional(),
});

const linkedinDraft = z.strictObject({
  channel: z.literal('linkedin'),
  text: z.string().min(1),
  link: link.optional(),
  firstComment: z.string().min(1).optional(),
});

const blogDraft = z.strictObject({
  channel: z.literal('blog'),
  slug: z.string().min(1),
  title: z.string().min(1),
  prNumber: z.number().int().positive().optional(),
  branchUpdatedAt: z.iso.datetime({ offset: true }).optional(),
  mergedAt: z.iso.datetime({ offset: true }).optional(),
});

const devtoDraft = z.strictObject({
  channel: z.literal('devto'),
  blogSlug: z.string().min(1),
  article: z.strictObject({
    title: z.string().min(1),
    tags: z.array(z.string()),
    description: z.string(),
  }),
});

const draftSchemas = {
  x: xDraft,
  linkedin: linkedinDraft,
  blog: blogDraft,
  devto: devtoDraft,
} as const;

/** The calendar date (`YYYY-MM-DD`) of an instant in America/New_York. */
function newYorkDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * A week of drafted posts, as written by the research and drafting steps and
 * read by `importWeek`. Every post is validated against its channel's draft
 * shape, scheduled inside the week in America/New_York, and may depend on
 * another post of the same week by key.
 */
export const WeekImport = z
  .object({
    /** The Monday the week starts on. */
    weekStart: z.iso.date(),
    researchBrief: z.record(z.string(), z.unknown()),
    posts: z.array(
      z.object({
        key: z.string().min(1),
        channel: z.enum(['x', 'linkedin', 'blog', 'devto']),
        kind: z.enum([
          'release',
          'qa',
          'topical',
          'guide',
          'take',
          'blog_promo',
          'blog',
        ]),
        /** An ISO instant with an explicit UTC offset. */
        scheduledAt: z.iso.datetime({ offset: true }),
        draft: z.unknown(),
        sources: z.array(z.object({ url: z.url(), note: z.string() })),
        dependsOnKey: z.string().optional(),
      }),
    ),
  })
  .superRefine((week, ctx) => {
    const monday = new Date(`${week.weekStart}T00:00:00Z`).getUTCDay() === 1;
    if (!monday) {
      ctx.addIssue({
        code: 'custom',
        path: ['weekStart'],
        message: 'weekStart must be a Monday',
      });
    }
    const sunday = addDays(week.weekStart, 6);
    const keys = new Set<string>();

    week.posts.forEach((post, index) => {
      if (keys.has(post.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['posts', index, 'key'],
          message: `duplicate post key "${post.key}"`,
        });
      }
      keys.add(post.key);

      const local = newYorkDate(new Date(post.scheduledAt));
      if (local < week.weekStart || local > sunday) {
        ctx.addIssue({
          code: 'custom',
          path: ['posts', index, 'scheduledAt'],
          message: `scheduledAt must fall between ${week.weekStart} and ${sunday} in ${TIME_ZONE}`,
        });
      }

      const draft = draftSchemas[post.channel].safeParse(post.draft);
      if (!draft.success) {
        for (const issue of draft.error.issues) {
          ctx.addIssue({
            code: 'custom',
            path: ['posts', index, 'draft', ...issue.path],
            message: issue.message,
          });
        }
      }
    });

    week.posts.forEach((post, index) => {
      if (
        post.dependsOnKey !== undefined &&
        (post.dependsOnKey === post.key || !keys.has(post.dependsOnKey))
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['posts', index, 'dependsOnKey'],
          message: `dependsOnKey "${post.dependsOnKey}" must name another post's key`,
        });
      }
    });
  });

/** A validated week import. */
export type WeekImport = z.infer<typeof WeekImport>;
