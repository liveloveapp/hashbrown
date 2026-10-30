/** The channels the marketing app publishes to. */
export type SocialChannel = 'x' | 'linkedin' | 'devto';

/** The dev.to article fields that sit beside the markdown body. */
export interface DraftArticle {
  /** 1-128 chars. */
  title: string;
  /** Dev.to: `^[a-z0-9]+$`, at most 4 items, each at most 30 chars. */
  tags?: string[];
  /** Absolute https: URL of the origin post, for search engines. */
  canonicalUrl?: string;
  /** Meta description; falls through to the platform's SEO subtitle. */
  description?: string;
}

/** A post ready to publish. Phase 1 posts are text only. */
export interface Draft {
  channel: SocialChannel;
  text?: string;
  threadParts?: string[];
  link?: { url: string; previewTitle?: string };
  scheduledAt?: string;
  article?: DraftArticle;
  /** LinkedIn only: posted as the author's first comment right after the post. */
  firstComment?: string;
}

/** Where a published post lives. */
export interface PostResult {
  channel: SocialChannel;
  postId: string;
  url: string;
  postedAt: string;
  /** Follow-up steps that failed after the post itself went live. */
  warnings?: string[];
}

/** Validates and publishes drafts for one channel. */
export interface ChannelAdapter {
  readonly id: SocialChannel;
  post(draft: Draft): Promise<PostResult>;
}
